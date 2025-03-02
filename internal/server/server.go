package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
)

type RequestLog struct {
	Timestamp   time.Time           `json:"timestamp"`
	Method      string              `json:"method"`
	Path        string              `json:"path"`
	Headers     map[string][]string `json:"headers"`
	DirectIP    string              `json:"directIP"`
	ForwardedIP string              `json:"forwardedIP"`
	Response    string              `json:"response"`
	StatusCode  int                 `json:"statusCode"`
}

type PathResponse struct {
	StatusCode int    `json:"statusCode"`
	Body       string `json:"body"`
}

type MockServer struct {
	router          *mux.Router
	defaultResponse PathResponse
	pathResponses   map[string]PathResponse
	requestLogs     []RequestLog
	mu              sync.RWMutex
}

func NewMockServer(response string) *MockServer {
	r := mux.NewRouter()
	ms := &MockServer{
		router: r,
		defaultResponse: PathResponse{
			StatusCode: http.StatusOK,
			Body:       response,
		},
		pathResponses: make(map[string]PathResponse),
		requestLogs:   make([]RequestLog, 0),
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

func (ms *MockServer) handleRequest(w http.ResponseWriter, r *http.Request) {
	directIP := r.RemoteAddr
	forwardedIP := r.Header.Get("X-Forwarded-For")

	if host, _, err := net.SplitHostPort(directIP); err == nil {
		directIP = normalizeIP(host)
	}

	// Get response for this path
	ms.mu.RLock()
	response, exists := ms.pathResponses[r.URL.Path]
	if !exists {
		response = ms.defaultResponse
	}
	ms.mu.RUnlock()

	// Log the request details
	log.Printf("Request: %s %s | Direct IP: [%s] | X-Forwarded-For: [%s]",
		r.Method, r.URL.Path, directIP, forwardedIP,
	)

	// Store request log
	requestLog := RequestLog{
		Timestamp:   time.Now(),
		Method:      r.Method,
		Path:        r.URL.Path,
		Headers:     r.Header,
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

	if path == "/" {
		ms.defaultResponse = PathResponse{
			StatusCode: statusCode,
			Body:       response,
		}
	} else {
		ms.pathResponses[path] = PathResponse{
			StatusCode: statusCode,
			Body:       response,
		}
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

// Update the handleUpdateResponse to handle path-specific responses
func (ms *MockServer) handleUpdateResponse(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path       string `json:"path"`
		StatusCode int    `json:"statusCode"`
		Response   string `json:"response"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.StatusCode == 0 {
		req.StatusCode = http.StatusOK
	}

	ms.UpdatePathResponse(req.Path, req.StatusCode, req.Response)
	w.WriteHeader(http.StatusOK)
}

// Add new endpoint to get all path responses
func (ms *MockServer) handleGetResponses(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ms.GetPathResponses())
}

func (ms *MockServer) StartAdmin(adminPort int) error {
	adminRouter := mux.NewRouter()

	// Serve static files
	fs := http.FileServer(http.Dir("static"))
	adminRouter.PathPrefix("/static/").Handler(http.StripPrefix("/static/", fs))

	// API endpoints
	adminRouter.HandleFunc("/api/logs", ms.handleGetLogs).Methods("GET")
	adminRouter.HandleFunc("/api/responses", ms.handleGetResponses).Methods("GET")
	adminRouter.HandleFunc("/api/response", ms.handleUpdateResponse).Methods("POST")

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
