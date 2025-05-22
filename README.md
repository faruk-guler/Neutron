# Neutron
## Lightweight and Powerful automation tool for Linux/Unix
## Basic Ansible Alternative Project
<img src="https://farukguler.com/assets/img/neutron.png" alt="alt text" width="300" height="200">

It is a lightweight, fast, and Powerful For security reasons, it will only support connection via SSH key.

Only (eval) executes the given expression as a shell string (text).

Author: faruk-guler
## Usage:
> chmod 600 config.ner sources.ner ~/.ssh/neutron.key
>
> chmod 700 main.sh
> 
> ./main.sh
> 
> ./main.sh task.ner # coming soon :(
~~~sh
Neutron Structure:
├── config.ner  # Server information (port, credentials)
├── main.sh     # Main command (Python runs commands)
├── sources.ner # source list(IP/DNS, servers)
├── task.ner    # Optional long commands, scripts)
~~~
~~~sh
## enable ssh-agent private-key login
eval "$(ssh-agent -s)"
ssh-add /root/.ssh/ansible.key
~~~

# Requirements:
- SSH key passphrases
- SSH service and ports


