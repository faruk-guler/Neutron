import yaml
import paramiko
import winrm
import os
import argparse
import sys

def load_yaml(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except FileNotFoundError:
        print(f"[ERROR] File not found: {path}")
        sys.exit(1)
    except yaml.YAMLError as e:
        print(f"[ERROR] YAML parse error in {path}: {e}")
        sys.exit(1)

def validate_config(config):
    if 'ssh' not in config and 'winrm' not in config:
        raise ValueError("Both 'ssh' and 'winrm' sections are missing in config.yaml.")

    if 'ssh' in config:
        ssh = config['ssh']
        if 'user' not in ssh:
            raise ValueError("Missing 'user' in config.yaml -> ssh section.")
        if not ('password' in ssh or 'key_path' in ssh):
            raise ValueError("Either 'password' or 'key_path' must be present in config.yaml -> ssh.")
        if 'port' in ssh and not isinstance(ssh['port'], int):
            raise ValueError("'port' in ssh section must be an integer.")

    if 'winrm' in config:
        winrm_conf = config['winrm']
        if 'user' not in winrm_conf or 'password' not in winrm_conf:
            raise ValueError("Missing 'user' or 'password' in config.yaml -> winrm section.")
        if 'port' in winrm_conf and not isinstance(winrm_conf['port'], int):
            raise ValueError("'port' in winrm section must be an integer.")

def validate_source(source):
    if 'servers' not in source:
        raise ValueError("Missing 'servers' section in source.yaml.")
    for i, server in enumerate(source['servers'], 1):
        if 'host' not in server:
            raise ValueError(f"Server #{i} is missing 'host'.")
        if 'type' not in server:
            raise ValueError(f"Server #{i} is missing 'type'.")
        if server['type'] not in ['ssh', 'winrm']:
            raise ValueError(f"Server #{i} has unsupported type: {server['type']} (must be 'ssh' or 'winrm').")

def validate_task_file(task_data, task_file):
    if not isinstance(task_data, dict) or 'commands' not in task_data:
        raise ValueError(f"Missing 'commands' section in {task_file}.")
    for i, task in enumerate(task_data['commands'], 1):
        if 'type' not in task:
            raise ValueError(f"Command #{i} in {task_file} is missing 'type'.")
        if task['type'] not in ['ssh', 'winrm']:
            raise ValueError(f"Command #{i} in {task_file} has invalid type: {task['type']}")
        if 'command' not in task:
            raise ValueError(f"Command #{i} in {task_file} is missing 'command'.")

def run_ssh_command(server, config, command):
    print(f"\n[SSH] {server['host']}")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    connect_args = {
        "hostname": server['host'],
        "port": config['ssh'].get('port', 22),
        "username": config['ssh']['user'],
        "timeout": 10
    }

    if 'password' in config['ssh']:
        connect_args['password'] = config['ssh']['password']
    elif 'key_path' in config['ssh']:
        connect_args['key_filename'] = os.path.expanduser(config['ssh']['key_path'])
    else:
        print("[ERROR] SSH config missing 'password' or 'key_path'")
        return

    try:
        ssh.connect(**connect_args)
        stdin, stdout, stderr = ssh.exec_command(command)
        output = stdout.read().decode().strip()
        error = stderr.read().decode().strip()

        if output:
            print(f"[OUTPUT] {output}")
        if error:
            print(f"[ERROR] {error}")
    except paramiko.AuthenticationException:
        print("[ERROR] SSH authentication failed.")
    except paramiko.SSHException as e:
        print(f"[ERROR] SSH error: {e}")
    except Exception as e:
        print(f"[ERROR] SSH unknown error: {e}")
    finally:
        ssh.close()

def run_winrm_command(server, config, command):
    print(f"\n[WinRM] {server['host']}")
    try:
        session = winrm.Session(
            f"http://{server['host']}:{config['winrm'].get('port', 5985)}/wsman",
            auth=(config['winrm']['user'], config['winrm']['password'])
        )
        result = session.run_cmd(command)
        output = result.std_out.decode().strip()
        error = result.std_err.decode().strip()

        if output:
            print(f"[OUTPUT] {output}")
        if error:
            print(f"[ERROR] {error}")
    except Exception as e:
        print(f"[ERROR] WinRM error: {e}")

def run_task_file(task_file, servers, config):
    task_data = load_yaml(task_file)
    try:
        validate_task_file(task_data, task_file)
    except ValueError as e:
        print(f"[ERROR] {e}")
        return

    for task in task_data['commands']:
        for server in servers:
            if server['type'] == task['type']:
                if task['type'] == 'ssh':
                    run_ssh_command(server, config, task['command'])
                elif task['type'] == 'winrm':
                    run_winrm_command(server, config, task['command'])

def interactive_mode(servers, config):
    print("[INFO] Interactive mode activated. Type 'exit' to quit.")
    while True:
        try:
            user_input = input("\nCommand > ").strip()
            if user_input.lower() == 'exit':
                print("[INFO] Exiting interactive mode.")
                break

            for server in servers:
                if server['type'] == 'ssh':
                    run_ssh_command(server, config, user_input)
                elif server['type'] == 'winrm':
                    run_winrm_command(server, config, user_input)
        except KeyboardInterrupt:
            print("\n[INFO] Keyboard interrupt received. Exiting interactive mode.")
            break

def main():
    parser = argparse.ArgumentParser(description="SSH & WinRM Management Tool")
    parser.add_argument('-i', '--input', help='YAML task file, e.g., ssh-task.yaml')
    args = parser.parse_args()

    try:
        config = load_yaml("config.yaml")
        validate_config(config)
    except ValueError as e:
        print(f"[ERROR] config.yaml validation failed: {e}")
        return

    try:
        source = load_yaml("source.yaml")
        validate_source(source)
        servers = source['servers']
    except ValueError as e:
        print(f"[ERROR] source.yaml validation failed: {e}")
        return

    if args.input:
        run_task_file(args.input, servers, config)
    else:
        interactive_mode(servers, config)

if __name__ == "__main__":
    main()
