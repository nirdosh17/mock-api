package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

// Version is the current CLI version.
// This is overwrriten by semantic version tag while building binaries.
var Version = "development"

// versionCmd represents the version command
var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Shows cli command version",
	Long:  "Shows cli command version",
	Run: func(cmd *cobra.Command, args []string) {
		printVersion()
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
	rootCmd.Version = Version
}

// printVersion prints the version information
func printVersion() {
	fmt.Printf("Version: %s\n", Version)
}
