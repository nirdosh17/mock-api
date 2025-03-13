package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

type RequestLog struct {
	Timestamp   time.Time           `json:"timestamp"`
	Method      string              `json:"method"`
	Path        string              `json:"path"`
	Headers     map[string][]string `json:"headers"`
	QueryParams map[string]string   `json:"queryParams"`
	Body        string              `json:"body"`
	DirectIP    string              `json:"directIP"`
	ForwardedIP string              `json:"forwardedIP"`
	Response    string              `json:"response"`
	StatusCode  int                 `json:"statusCode"`
}

type PathResponse struct {
	StatusCode int    `json:"statusCode"`
	Body       string `json:"body"`
	Advanced   struct {
		HangUp        bool    `json:"hangUp"`
		Timeout       float64 `json:"timeout"`
		RejectRequest bool    `json:"rejectRequest"`
		Delay         float64 `json:"delay"`
	} `json:"advanced"`
}

type HangingRequest struct {
	ID        string              `json:"id"`
	Timestamp time.Time           `json:"timestamp"`
	Method    string              `json:"method"`
	Path      string              `json:"path"`
	Headers   map[string][]string `json:"headers"`
	DirectIP  string              `json:"directIP"`
	Response  http.ResponseWriter `json:"-"`
	done      chan struct{}       `json:"-"`
}

type MockServer struct {
	router          *mux.Router
	defaultResponse PathResponse
	pathResponses   map[string]PathResponse
	requestLogs     []RequestLog
	mu              sync.RWMutex
	hangingRequests map[string]*HangingRequest
	hangingMu       sync.RWMutex
}

func NewMockServer(response string) *MockServer {
	r := mux.NewRouter()
	ms := &MockServer{
		router: r,
		defaultResponse: PathResponse{
			StatusCode: http.StatusOK,
			Body:       response,
		},
		pathResponses:   make(map[string]PathResponse),
		requestLogs:     make([]RequestLog, 0),
		hangingRequests: make(map[string]*HangingRequest),
	}
	ms.setupRoutes()
	return ms
}

func (ms *MockServer) setupRoutes() {
	ms.router.PathPrefix("/").HandlerFunc(ms.handleRequest)
}

// Helper function to normalize IP address
func normalizeIP(ip string) string {
	// Convert localhost IPv6 to IPv4
	if ip == "::1" {
		return "127.0.0.1"
	}

	// If it's an IPv6 address
	if strings.Contains(ip, ":") {
		// Check if it's an IPv4-mapped IPv6 address
		if strings.HasPrefix(ip, "::ffff:") {
			return strings.TrimPrefix(ip, "::ffff:")
		}
	}
	return ip
}

// Add this helper function
func flattenQueryParams(params map[string][]string) map[string]string {
	flattened := make(map[string]string)
	for key, values := range params {
		if len(values) == 1 {
			flattened[key] = values[0]
		} else {
			// Keep as JSON array for multiple values
			flattened[key] = strings.Join(values, ",")
		}
	}
	return flattened
}

func (ms *MockServer) handleRequest(w http.ResponseWriter, r *http.Request) {
	directIP := r.RemoteAddr
	forwardedIP := r.Header.Get("X-Forwarded-For")

	if host, _, err := net.SplitHostPort(directIP); err == nil {
		directIP = normalizeIP(host)
	}

	// Get response for this path with exact matching
	ms.mu.RLock()
	response, exists := ms.pathResponses[r.URL.Path]
	if !exists {
		// Only use default response if the path exactly matches "/"
		if r.URL.Path == "/" {
			response = ms.defaultResponse
		} else {
			// Return 404 for non-existent paths
			response = PathResponse{
				StatusCode: http.StatusNotFound,
				Body:       `{"error": "path not found"}`,
			}
		}
	}
	ms.mu.RUnlock()

	// Log the request details
	log.Printf("Request: %s %s | Direct IP: [%s] | X-Forwarded-For: [%s]",
		r.Method, r.URL.Path, directIP, forwardedIP,
	)

	// Handle advanced features
	if response.Advanced.RejectRequest {
		// Close connection without response
		hj, ok := w.(http.Hijacker)
		if !ok {
			http.Error(w, "Server error", http.StatusInternalServerError)
			return
		}
		conn, _, err := hj.Hijack()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// Force close the TCP connection without sending any response
		// This will result in ERR_CONNECTION_REFUSED on the client side
		if tc, ok := conn.(*net.TCPConn); ok {
			tc.SetLinger(0) // Send RST instead of FIN
			tc.Close()
		} else {
			conn.Close()
		}
		return
	}

	if response.Advanced.Timeout > 0 {
		time.Sleep(time.Duration(response.Advanced.Timeout * float64(time.Second)))
	}

	if response.Advanced.HangUp {
		// Store the hanging request
		id := uuid.New().String()
		hangingReq := &HangingRequest{
			ID:        id,
			Timestamp: time.Now(),
			Method:    r.Method,
			Path:      r.URL.Path,
			Headers:   r.Header,
			DirectIP:  directIP,
			Response:  w,
			done:      make(chan struct{}),
		}

		ms.hangingMu.Lock()
		ms.hangingRequests[id] = hangingReq
		ms.hangingMu.Unlock()

		// Wait for signal or forever
		select {
		case <-hangingReq.done:
			return
		}
	}

	// Add delay before sending response
	if response.Advanced.Delay > 0 {
		time.Sleep(time.Duration(response.Advanced.Delay * float64(time.Second)))
	}

	// Read request body
	var bodyStr string
	if r.Body != nil {
		bodyBytes, err := io.ReadAll(r.Body)
		if err == nil {
			bodyStr = string(bodyBytes)
			// Restore the body for further processing
			r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
		}
	}

	// Parse and flatten query parameters
	queryParams := flattenQueryParams(r.URL.Query())

	// Create request log
	requestLog := RequestLog{
		Timestamp:   time.Now(),
		Method:      r.Method,
		Path:        r.URL.Path,
		Headers:     r.Header,
		QueryParams: queryParams,
		Body:        bodyStr,
		DirectIP:    directIP,
		ForwardedIP: forwardedIP,
		Response:    response.Body,
		StatusCode:  response.StatusCode,
	}

	ms.mu.Lock()
	ms.requestLogs = append(ms.requestLogs, requestLog)
	ms.mu.Unlock()

	// Set response headers
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(response.StatusCode)
	fmt.Fprint(w, response.Body)
}

func (ms *MockServer) GetLogs() []RequestLog {
	ms.mu.RLock()
	defer ms.mu.RUnlock()
	return ms.requestLogs
}

func (ms *MockServer) UpdatePathResponse(path string, statusCode int, response string) {
	ms.mu.Lock()
	defer ms.mu.Unlock()

	newResponse := PathResponse{
		StatusCode: statusCode,
		Body:       response,
	}

	if path == "/" {
		ms.defaultResponse = newResponse
	} else {
		ms.pathResponses[path] = newResponse
	}
}

func (ms *MockServer) GetPathResponses() map[string]PathResponse {
	ms.mu.RLock()
	defer ms.mu.RUnlock()

	responses := make(map[string]PathResponse)
	responses["/"] = ms.defaultResponse
	for path, resp := range ms.pathResponses {
		responses[path] = resp
	}
	return responses
}

// Update the request struct in handleUpdateResponse
func (ms *MockServer) handleUpdateResponse(w http.ResponseWriter, r *http.Request) {
	// Log the raw request body first
	bodyBytes, _ := io.ReadAll(r.Body)
	log.Printf("Raw request body: %s", string(bodyBytes))
	r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes)) // Reset the body for later reading

	var req struct {
		Path       string `json:"path"`
		StatusCode int    `json:"statusCode"`
		Response   string `json:"response"`
		Advanced   struct {
			HangUp        bool    `json:"hangUp"`
			Timeout       float64 `json:"timeout"`
			RejectRequest bool    `json:"rejectRequest"`
			Delay         float64 `json:"delay"`
		} `json:"advanced"`
	}

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		log.Printf("Error decoding request: %v", err) // Add error logging
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}

	log.Printf("Decoded request: %+v", req) // Log the decoded request

	if req.StatusCode == 0 {
		req.StatusCode = http.StatusOK
	}

	response := PathResponse{
		StatusCode: req.StatusCode,
		Body:       req.Response,
		Advanced:   req.Advanced,
	}

	ms.mu.Lock()
	if req.Path == "/" {
		ms.defaultResponse = response
	} else {
		ms.pathResponses[req.Path] = response
	}
	ms.mu.Unlock()

	w.WriteHeader(http.StatusOK)
}

// Add new endpoint to get all path responses
func (ms *MockServer) handleGetResponses(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ms.GetPathResponses())
}

// Add this new method
func (ms *MockServer) DeletePathResponse(path string) error {
	ms.mu.Lock()
	defer ms.mu.Unlock()

	if path == "/" {
		return fmt.Errorf("cannot delete default path response")
	}

	delete(ms.pathResponses, path)
	return nil
}

// Add this new handler
func (ms *MockServer) handleDeleteResponse(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path parameter is required", http.StatusBadRequest)
		return
	}

	if err := ms.DeletePathResponse(path); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// Add new endpoint to get hanging requests
func (ms *MockServer) handleGetHangingRequests(w http.ResponseWriter, r *http.Request) {
	ms.hangingMu.RLock()
	defer ms.hangingMu.RUnlock()

	// Convert to a slice for JSON response
	requests := make([]HangingRequest, 0, len(ms.hangingRequests))
	for _, req := range ms.hangingRequests {
		// Create a copy without the ResponseWriter
		requests = append(requests, HangingRequest{
			ID:        req.ID,
			Timestamp: req.Timestamp,
			Method:    req.Method,
			Path:      req.Path,
			Headers:   req.Headers,
			DirectIP:  req.DirectIP,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(requests)
}

// Update the handleHangingRequestAction function
func (ms *MockServer) handleHangingRequestAction(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID     string `json:"id"`
		Action string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ms.hangingMu.Lock()
	hangingReq, exists := ms.hangingRequests[req.ID]
	if !exists {
		ms.hangingMu.Unlock()
		http.Error(w, "Request not found", http.StatusNotFound)
		return
	}

	// Check if request is already being handled
	select {
	case <-hangingReq.done:
		ms.hangingMu.Unlock()
		http.Error(w, "Request already handled", http.StatusConflict)
		return
	default:
	}

	// Get what we need before unlocking
	reqResponse := hangingReq.Response
	reqDone := hangingReq.done
	path := hangingReq.Path
	method := hangingReq.Method
	headers := hangingReq.Headers
	directIP := hangingReq.DirectIP
	forwardedIP := ""
	if fwdIPs := headers["X-Forwarded-For"]; len(fwdIPs) > 0 {
		forwardedIP = fwdIPs[0]
	}
	timestamp := hangingReq.Timestamp

	// Delete the request from the map first
	delete(ms.hangingRequests, req.ID)
	ms.hangingMu.Unlock()

	// Signal the request to stop hanging before doing anything else
	close(reqDone)

	switch req.Action {
	case "respond":
		// Get the response configuration
		response, exists := ms.pathResponses[path]
		if !exists {
			if path == "/" {
				response = ms.defaultResponse
			} else {
				response = PathResponse{
					StatusCode: http.StatusNotFound,
					Body:       `{"error": "path not found"}`,
				}
			}
		}

		// Send success response to admin first
		w.WriteHeader(http.StatusOK)

		// Send the response
		reqResponse.Header().Set("Content-Type", "application/json")
		reqResponse.WriteHeader(response.StatusCode)
		fmt.Fprint(reqResponse, response.Body)

		// Store request log
		requestLog := RequestLog{
			Timestamp:   timestamp,
			Method:      method,
			Path:        path,
			Headers:     headers,
			DirectIP:    directIP,
			ForwardedIP: forwardedIP,
			Response:    response.Body,
			StatusCode:  response.StatusCode,
		}

		ms.mu.Lock()
		ms.requestLogs = append(ms.requestLogs, requestLog)
		ms.mu.Unlock()

	case "drop":
		if hj, ok := reqResponse.(http.Hijacker); ok {
			conn, _, err := hj.Hijack()
			if err != nil {
				log.Printf("Failed to hijack connection: %v", err)
				http.Error(w, "Failed to drop connection", http.StatusInternalServerError)
				return
			}

			// Force close the TCP connection
			dropSuccessful := false
			if tc, ok := conn.(*net.TCPConn); ok {
				tc.SetLinger(0)
				tc.SetDeadline(time.Now())
				tc.Close()
				dropSuccessful = true
			} else {
				conn.Close()
				dropSuccessful = true
			}

			if dropSuccessful {
				// Store request log for dropped request only if we successfully dropped it
				requestLog := RequestLog{
					Timestamp:   timestamp,
					Method:      method,
					Path:        path,
					Headers:     headers,
					DirectIP:    directIP,
					ForwardedIP: forwardedIP,
					Response:    "Connection dropped",
					StatusCode:  0,
				}

				ms.mu.Lock()
				ms.requestLogs = append(ms.requestLogs, requestLog)
				ms.mu.Unlock()

				// Send success response to admin
				w.WriteHeader(http.StatusOK)
			} else {
				http.Error(w, "Failed to drop connection", http.StatusInternalServerError)
			}
		} else {
			http.Error(w, "Connection hijacking not supported", http.StatusInternalServerError)
			return
		}

	default:
		http.Error(w, "Invalid action", http.StatusBadRequest)
		return
	}
}

// Update StartAdmin to add the new delete endpoint
func (ms *MockServer) StartAdmin(adminPort int) error {
	adminRouter := mux.NewRouter()

	// Serve static files
	fs := http.FileServer(http.Dir("static"))
	adminRouter.PathPrefix("/static/").Handler(http.StripPrefix("/static/", fs))

	// API endpoints
	adminRouter.HandleFunc("/api/logs", ms.handleGetLogs).Methods("GET")
	adminRouter.HandleFunc("/api/responses", ms.handleGetResponses).Methods("GET")
	adminRouter.HandleFunc("/api/response", ms.handleUpdateResponse).Methods("POST")
	adminRouter.HandleFunc("/api/response", ms.handleDeleteResponse).Methods("DELETE")
	adminRouter.HandleFunc("/api/hanging-requests", ms.handleGetHangingRequests).Methods("GET")
	adminRouter.HandleFunc("/api/hanging-request", ms.handleHangingRequestAction).Methods("POST")

	// Serve index.html for root path
	adminRouter.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "static/index.html")
	})

	log.Printf("Starting admin web interface at http://localhost:%d", adminPort)
	return http.ListenAndServe(fmt.Sprintf(":%d", adminPort), adminRouter)
}

func (ms *MockServer) handleGetLogs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ms.GetLogs())
}

func (ms *MockServer) Start(port int) error {
	log.Printf("Starting mock server at http://localhost:%d", port)
	log.Printf("Default response: %s", ms.defaultResponse.Body)

	return http.ListenAndServe(fmt.Sprintf(":%d", port), ms.router)
}
