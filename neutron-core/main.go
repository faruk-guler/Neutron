package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
)

func main() {
	// Flags
	cmdPtr := flag.String("cmd", "", "Command to execute on all hosts")
	pushPtr := flag.String("push", "", "File to push (format: local_path:remote_path)")
	pullPtr := flag.String("pull", "", "File to pull (format: remote_path:local_dir)")
	configPtr := flag.String("config", "config.yaml", "Path to config file")
	quietPtr := flag.Bool("q", false, "Quiet mode (suppress branding)")

	flag.Parse()

	if *cmdPtr == "" && *pushPtr == "" {
		fmt.Println("Usage: neutron-core -cmd <command> [-q] [-config <path>]")
		fmt.Println("       neutron-core -push <local:remote> [-q]")
		os.Exit(1)
	}

	// Load configuration
	cfg, err := LoadConfig(*configPtr)
	if err != nil {
		log.Fatalf("Config Error: %v", err)
	}

	// Initialize Engine
	engine, err := NewSSHEngine(cfg)
	if err != nil {
		log.Fatalf("Engine Error: %v", err)
	}

	// Branding (if not quiet)
	if !*quietPtr {
		fmt.Println("------------------------------------------------------")
		fmt.Println("  Neutron v10 - Ultimate Go Core")
		fmt.Println("------------------------------------------------------")
	}

	// Run Logic
	if *cmdPtr != "" {
		engine.ExecuteAll(*cmdPtr)
	} else if *pushPtr != "" {
		parts := strings.Split(*pushPtr, ":")
		if len(parts) < 2 {
			log.Fatalf("Push error: format must be local_path:remote_path")
		}
		engine.Push(parts[0], parts[1])
	} else if *pullPtr != "" {
		parts := strings.Split(*pullPtr, ":")
		if len(parts) < 2 {
			log.Fatalf("Pull error: format must be remote_path:local_dir")
		}
		engine.Pull(parts[0], parts[1])
	}
}
