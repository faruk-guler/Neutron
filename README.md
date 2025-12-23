# Neutron v10 - Automation Tool
## Lightweight and Powerful automation tool for Linux/Unix Ansible Alternative Project
```mermaid
flowchart TB
    subgraph Client["🖥️ Neutron Client"]
        CLI["Interactive Shell<br/>./main.sh"]
        Deploy["Deployment Mode<br/>./main.sh deploy.yaml"]
        Config["config.yaml<br/>SSH credentials & hosts"]
    end

    subgraph Core["⚡ Core Engine"]
        Parser["YAML Parser"]
        Pool["SSH Connection Pool<br/>(Multiplexing)"]
        Executor["Command Executor"]
    end

    subgraph Commands["📦 Built-in Commands"]
        Push["push - File Upload"]
        Pull["pull - File Download"]
        CD["cd - Change Directory"]
        Exec["Shell Commands"]
    end

    subgraph Hosts["🖧 Remote Hosts"]
        H1["Host 1<br/>192.168.x.x:22"]
        H2["Host 2<br/>192.168.x.x:22"]
        H3["Host N<br/>hostname:port"]
    end

    CLI --> Parser
    Deploy --> Parser
    Config --> Parser
    Parser --> Pool
    Pool --> Executor
    Executor --> Push & Pull & CD & Exec
    Push & Pull & CD & Exec --> H1 & H2 & H3

    style Client fill:#1a1a2e,stroke:#16213e,color:#eee
    style Core fill:#0f3460,stroke:#16213e,color:#eee
    style Commands fill:#533483,stroke:#16213e,color:#eee
    style Hosts fill:#e94560,stroke:#16213e,color:#eee
```

It is a lightweight, fast, and Powerful For security reasons, it will only support connection via SSH key.

"StrictHostKeyChecking=no"
Disables host key verification on SSH connections. This can create a MITM (Man-in-the-Middle) vuln.

Only for Linux systems. Support for Windows systems has been discontinued.

(eval) executes the given expression as a shell string (full text). It is therefore very powerful. Use with caution!

# Neutron v10 - Automation Tool
- Version: 10
- Author: faruk-guler | github.com/faruk-guler
- Date: 2025
## Usage:
> chmod 600 config.yaml ~/.ssh/neutron.key
>
> chmod 700 main.sh
> 
> ./main.sh
> 
> ./main.sh deploy.yaml # Automated deployment
> 
> shell # push /local/path/file.txt /remote/path/  # Parallel upload
> 
> shell # pull /var/log/app.log ./logs/  # Parallel down.
~~~sh
# Neutron Structure:
├── config.yaml # Configuration (credentials and hosts)
├── main.sh     # Main tool (bash runs commands)
├── deploy.yaml # Deployment playbook
~~~
~~~sh
# Start SSH Agent and load the Private key into the agent:
eval "$(ssh-agent -s)"
ssh-add /root/.ssh/neutron.key
~~~

# Requirements:
- SSH key passphrases
- SSH service and ports


