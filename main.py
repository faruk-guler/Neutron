import yaml
import paramiko
import winrm
import os
import argparse

def load_yaml(path):
    with open(path, 'r') as f:
        return yaml.safe_load(f)

def run_ssh_command(server, config, command):
    print(f"\n[SSH] {server['host']}")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        hostname=server['host'],
        port=config['ssh'].get('port', 22),
        username=config['ssh']['user'],
        key_filename=os.path.expanduser(config['ssh']['key_path']),
        timeout=10
    )
    stdin, stdout, stderr = ssh.exec_command(command)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print(f"Error: {err}")
    ssh.close()

def run_winrm_command(server, config, command):
    print(f"\n[WinRM] {server['host']}")
    session = winrm.Session(
        f"http://{server['host']}:{config['winrm'].get('port', 5985)}/wsman",
        auth=(config['winrm']['user'], config['winrm']['password'])
    )
    result = session.run_cmd(command)
    print(result.std_out.decode())
    if result.std_err:
        print(f"Error: {result.std_err.decode()}")

def run_task_file(task_file, servers, config):
    tasks = load_yaml(task_file)
    for task in tasks['commands']:
        task_type = task['type']
        command = task['command']
        for server in servers:
            if server['type'] == task_type:
                if task_type == 'ssh':
                    run_ssh_command(server, config, command)
                elif task_type == 'winrm':
                    run_winrm_command(server, config, command)

def interactive_mode(servers, config):
    print("Etkinleştirilmiş: Etkileşimli mod. Çıkmak için 'exit' yaz.")
    while True:
        user_input = input("\nKomut > ").strip()
        if user_input.lower() == 'exit':
            break
        for server in servers:
            if server['type'] == 'ssh':
                run_ssh_command(server, config, user_input)
            elif server['type'] == 'winrm':
                run_winrm_command(server, config, user_input)

def main():
    parser = argparse.ArgumentParser(description="SSH & WinRM yönetim aracı")
    parser.add_argument('-i', '--input', help='Komut dosyası (YAML) örnek: ssh-task.yaml')
    args = parser.parse_args()

    config = load_yaml("config.yaml")
    source = load_yaml("source.yaml")
    servers = source["servers"]

    if args.input:
        run_task_file(args.input, servers, config)
    else:
        interactive_mode(servers, config)

if __name__ == "__main__":
    main()
