package main

import (
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

type Config struct {
	SSHUser                string   `yaml:"ssh_user"`
	PrivateKeyFile         string   `yaml:"private_key_file"`
	StrictHostKeyChecking  string   `yaml:"strict_host_key_checking"`
	Hosts                  []string `yaml:"hosts"`
}

func LoadConfig(path string) (*Config, error) {
	data, err := ioutil.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg Config
	err = yaml.Unmarshal(data, &cfg)
	if err != nil {
		return nil, err
	}

	// Expand tilde in private key path
	if strings.HasPrefix(cfg.PrivateKeyFile, "~") {
		home, err := os.UserHomeDir()
		if err == nil {
			cfg.PrivateKeyFile = filepath.Join(home, cfg.PrivateKeyFile[2:])
		}
	}

	return &cfg, nil
}
