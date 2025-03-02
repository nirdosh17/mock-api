package cmd

import (
	"fmt"
	"log"
	"os"

	"github.com/nirdosh17/mock-api/internal/server"

	"github.com/spf13/cobra"
)

var (
	port      int
	adminPort int
	response  string
)

var rootCmd = &cobra.Command{
	Use:   "mock-api",
	Short: "A mock server that returns configurable responses",
	Long: `Mock-API is a simple HTTP server that can be configured to return
specific responses based on conditions. Similar to requestbin or postbin.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		mockServer := server.NewMockServer(response)

		// Start admin server in a goroutine
		go func() {
			if err := mockServer.StartAdmin(adminPort); err != nil {
				log.Printf("Admin server error: %v", err)
			}
		}()

		// Start main server
		return mockServer.Start(port)
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.Flags().IntVarP(&port, "port", "p", 8080, "Port to run the server on")
	rootCmd.Flags().IntVarP(&adminPort, "admin-port", "a", 8081, "Port to run the admin interface on")
	rootCmd.Flags().StringVarP(&response, "response", "r", "{\"status\":\"ok\"}", "Default response to return")
}
