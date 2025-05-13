# Neutron
## Lightweight and Powerful automation tool for Linux
<img src="https://farukguler.com/assets/img/neutron.png" alt="alt text" width="300" height="330">

It is a lightweight, fast, and Powerful automation tool.

Author: faruk-guler
## Usage:
> ./main.py
> 
> ./main.py task.yaml
~~~sh
Neutron Files/
├── config.yaml # Server information (port, credentials)
├── main.py     # Main command (Python runs commands)
├── source.yaml # source list(IP/DNS, servers)
├── task.yaml   # Optional commands, scripts)

Python Modules/
import yaml
import paramiko
import os
import sys

example: pip install pyyaml paramiko

~~~

# Requirements
- Python3
- SSH


