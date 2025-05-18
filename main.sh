#!/bin/bash

# intro show
echo "#######################################################"
echo "# Neutron"
echo "# Remote Command Executor"
echo "# Author: faruk-guler"
echo "# Page: www.farukguler.com github.com/faruk-guler"
echo "########################################################"

source config.ner || exit 1
source sources.ner || exit 1

declare -A current_dir
declare -A host_ports # To store host and port information

for host_port in "${HOSTS[@]}"; do
    IFS=: read host port <<< "$host_port"
    current_dir["$host"]="/root"
    host_ports["$host"]="$host:$port" # Store host:port information corresponding to the host
done

while read -p "shell # " -er cmd; do
    [ -z "$cmd" ] && continue
    [ "$cmd" = "exit" ] && break

    if [[ "$cmd" = cd* ]]; then
        dir="${cmd#cd }"
        for host in "${!current_dir[@]}"; do
            current_dir["$host"]="$dir"
        done
        continue
    fi

    declare -A jobs
    declare -A outputs

    for host in "${!current_dir[@]}"; do
        host_port="${host_ports["$host"]}"
        IFS=: read _ port <<< "$host_port" # Get port information
        temp_file=$(mktemp)
        outputs["$host"]="$temp_file"

        ssh_command="ssh -n -o ConnectTimeout=3 -o StrictHostKeyChecking=no -p \"$port\" \"$USER@$host\" \"cd \\\"${current_dir["$host"]}\\\" && hostname && $cmd\" > \"$temp_file\" 2>&1 &"

        if [ -n "$PRIVATE_KEY_FILE" ]; then
            ssh_command="ssh -i \"$PRIVATE_KEY_FILE\" -n -o ConnectTimeout=3 -o StrictHostKeyChecking=no -p \"$port\" \"$USER@$host\" \"cd \\\"${current_dir["$host"]}\\\" && hostname && $cmd\" > \"$temp_file\" 2>&1 &"
        elif [ -n "$PASSWORD" ]; then
            ssh_command="sshpass -p \"$PASSWORD\" ssh -n -o ConnectTimeout=3 -o StrictHostKeyChecking=no -p \"$port\" \"$USER@$host\" \"cd \\\"${current_dir["$host"]}\\\" && hostname && $cmd\" > \"$temp_file\" 2>&1 &"
        else
            echo "Error: Authentication information not found (password or private key not defined)."
            continue # Skip command execution for this host
        fi

        eval "$ssh_command"
        jobs["$host"]="$!"
    done

    first=true
    for host in "${!jobs[@]}"; do
        wait "${jobs["$host"]}"
        host_port="${host_ports["$host"]}"
        if ! "$first"; then
            echo ""
        fi
        echo "----------- $(echo "$host_port" | cut -d':' -f1) -----------"
        # Print only hostname and '#' sign
        hostname=$(cat "${outputs["$host"]}" | head -n 1)
        echo "$hostname #"
        # Skip the 'hostname' line and print the actual command output
        cat "${outputs["$host"]}" | tail -n +2
        echo "--------------------------------------------"
        rm "${outputs["$host"]}"
        first=false
    done
done
