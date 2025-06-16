# Neutron
## Lightweight and Powerful automation tool for Linux/Unix
## Ansible Alternative Project
<img src="https://farukguler.com/assets/img/neutron.png" alt="alt text" width="300" height="200">

It is a lightweight, fast, and Powerful For security reasons, it will only support connection via SSH key.

"StrictHostKeyChecking=no"
Disables host key verification on SSH connections. This can create a MITM (Man-in-the-Middle) vuln.

Only for Linux systems. Support for Windows systems has been discontinued.

Only (eval) executes the given expression as a shell string (text).

Author: faruk-guler
## Usage:
> chmod 600 config.ntr sources.ntr ~/.ssh/neutron.key
>
> chmod 700 main.sh
> 
> ./main.sh
> 
> ./main.sh task.ntr # coming soon :(
> 
> shell # put /local/path/file.txt /remote/path/  # Parallel upload
> 
> shell # get /var/log/app.log ./logs/  # Parallel down.
~~~sh
# Neutron Structure:
├── config.ntr  # Server information (port, credentials)
├── main.sh     # Main tool (bash runs commands)
├── sources.ntr # source list(IP/DNS, servers)
├── task.ntr    # Optional long commands, scripts)
~~~
~~~sh
# Start SSH Agent and load the Private key into the agent:
eval "$(ssh-agent -s)"
ssh-add /root/.ssh/neutron.key
~~~

# Requirements:
- SSH key passphrases
- SSH service and ports


