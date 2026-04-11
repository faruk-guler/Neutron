package main

import (
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

type SSHEngine struct {
	Config *Config
	Signer ssh.Signer
}

func NewSSHEngine(cfg *Config) (*SSHEngine, error) {
	key, err := ioutil.ReadFile(cfg.PrivateKeyFile)
	if err != nil {
		return nil, fmt.Errorf("unable to read private key: %v", err)
	}

	signer, err := ssh.ParsePrivateKey(key)
	if err != nil {
		return nil, fmt.Errorf("unable to parse private key: %v", err)
	}

	return &SSHEngine{Config: cfg, Signer: signer}, nil
}

func (e *SSHEngine) getHostKeyCallback() ssh.HostKeyCallback {
	if e.Config.StrictHostKeyChecking == "no" {
		return ssh.InsecureIgnoreHostKey()
	}

	home, _ := os.UserHomeDir()
	knownHostsPath := filepath.Join(home, ".ssh", "known_hosts")
	
	callback, err := knownhosts.New(knownHostsPath)
	if err != nil {
		log.Printf("Warning: Failed to load known_hosts (%v). Falling back to insecure.", err)
		return ssh.InsecureIgnoreHostKey()
	}
	return callback
}

func (e *SSHEngine) ExecuteAll(command string) {
	var wg sync.WaitGroup

	for _, hostPort := range e.Config.Hosts {
		wg.Add(1)
		go func(hp string) {
			defer wg.Done()
			e.ExecuteOnHost(hp, command)
		}(hostPort)
	}

	wg.Wait()
}

func (e *SSHEngine) ExecuteOnHost(hostPort, command string) {
	config := &ssh.ClientConfig{
		User: e.Config.SSHUser,
		Auth: []ssh.AuthMethod{
			ssh.PublicKeys(e.Signer),
		},
		HostKeyCallback: e.getHostKeyCallback(),
	}

	// Connect
	client, err := ssh.Dial("tcp", hostPort, config)
	if err != nil {
		fmt.Printf("host: %s\n--------------------------------------------\nERROR: %v\n--------------------------------------------\n", hostPort, err)
		return
	}
	defer client.Close()

	// New session
	session, err := client.NewSession()
	if err != nil {
		fmt.Printf("host: %s\n--------------------------------------------\nERROR: session fail: %v\n--------------------------------------------\n", hostPort, err)
		return
	}
	defer session.Close()

	// Output streaming
	stdout, _ := session.StdoutPipe()
	stderr, _ := session.StderrPipe()

	err = session.Start(command)
	if err != nil {
		fmt.Printf("host: %s\n--------------------------------------------\nERROR: start fail: %v\n--------------------------------------------\n", hostPort, err)
		return
	}

	fmt.Printf("host: %s\n--------------------------------------------\n", hostPort)
	
	// Print output in real-time
	var wg sync.WaitGroup
	wg.Add(2)
	
	streamer := func(r io.Reader, prefix string) {
		defer wg.Done()
		buf := make([]byte, 1024)
		for {
			n, err := r.Read(buf)
			if n > 0 {
				fmt.Print(string(buf[:n]))
			}
			if err != nil {
				break
			}
		}
	}

	go streamer(stdout, "")
	go streamer(stderr, "")
	
	wg.Wait()
	session.Wait()
	fmt.Printf("--------------------------------------------\n")
}

// Push method (Minimal native implementation via cat)
func (e *SSHEngine) Push(localPath, remotePath string) {
	fmt.Printf("INFO: Pushing %s to all hosts...\n", localPath)
	content, err := ioutil.ReadFile(localPath)
	if err != nil {
		log.Printf("Push Read Err: %v\n", err)
		return
	}

	var wg sync.WaitGroup
	for _, hostPort := range e.Config.Hosts {
		wg.Add(1)
		go func(hp string) {
			defer wg.Done()
			e.pushToHost(hp, content, remotePath)
		}(hostPort)
	}
	wg.Wait()
}

func (e *SSHEngine) pushToHost(hostPort string, content []byte, remotePath string) {
	config := &ssh.ClientConfig{
		User: e.Config.SSHUser,
		Auth: []ssh.AuthMethod{ssh.PublicKeys(e.Signer)},
		HostKeyCallback: e.getHostKeyCallback(),
	}

	client, err := ssh.Dial("tcp", hostPort, config)
	if err != nil { 
		fmt.Printf("ERROR: Push connect to %s fail: %v\n", hostPort, err)
		return 
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil { return }
	defer session.Close()

	session.Stdin = strings.NewReader(string(content))
	err = session.Run(fmt.Sprintf("cat > '%s'", remotePath))
	if err == nil {
		fmt.Printf("SUCCESS: Pushed to %s\n", hostPort)
	} else {
		fmt.Printf("ERROR: Push to %s fail: %v\n", hostPort, err)
	}
}

// Pull method (Recursive support via tar or cat)
func (e *SSHEngine) Pull(remotePath, localDir string) {
	fmt.Printf("INFO: Pulling %s from all hosts to %s...\n", remotePath, localDir)
	
	if _, err := os.Stat(localDir); os.IsNotExist(err) {
		os.MkdirAll(localDir, 0755)
	}

	var wg sync.WaitGroup
	for _, hostPort := range e.Config.Hosts {
		wg.Add(1)
		go func(hp string) {
			defer wg.Done()
			e.pullFromHost(hp, remotePath, localDir)
		}(hostPort)
	}
	wg.Wait()
}

func (e *SSHEngine) pullFromHost(hostPort, remotePath, localDir string) {
	config := &ssh.ClientConfig{
		User:            e.Config.SSHUser,
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(e.Signer)},
		HostKeyCallback: e.getHostKeyCallback(),
	}

	client, err := ssh.Dial("tcp", hostPort, config)
	if err != nil {
		fmt.Printf("ERROR: Pull connect to %s fail: %v\n", hostPort, err)
		return
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil { return }
	defer session.Close()

	// Safe local path creation
	safeHost := strings.Replace(hostPort, ":", "_", -1)
	targetPath := filepath.Join(localDir, safeHost, filepath.Base(remotePath))
	os.MkdirAll(filepath.Dir(targetPath), 0755)

	outFile, err := os.Create(targetPath)
	if err != nil {
		fmt.Printf("ERROR: Cannot create local file %s: %v\n", targetPath, err)
		return
	}
	defer outFile.Close()

	session.Stdout = outFile
	err = session.Run(fmt.Sprintf("cat '%s'", remotePath))
	if err == nil {
		fmt.Printf("SUCCESS: Pulled from %s to %s\n", hostPort, targetPath)
	} else {
		fmt.Printf("ERROR: Pull from %s fail (is it a directory? use tar logic if needed): %v\n", hostPort, err)
	}
}

