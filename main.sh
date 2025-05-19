#!/bin/bash

# Color definitions (added)
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Enable interpretation of backslash escapes
echo -e "$(cat << EOF
\033[0;36m###########################################################
# \033[0;32mNeutron v4
# Lightweight and Powerful automation tool for Linux/Unix
# Author: faruk-guler
# Page: www.farukguler.com github.com/faruk-guler
\033[0;36m###########################################################\033[0m
EOF
)"

# history file
HISTORY_FILE="$HOME/.neutron_history"
touch "$HISTORY_FILE"

# Readline conf.
if [[ $- == *i* ]]; then
    bind '"\e[A": history-search-backward'
    bind '"\e[B": history-search-forward'
    bind 'set show-all-if-ambiguous on'
    bind 'set completion-ignore-case on'
    bind 'TAB: menu-complete'
fi

source config.ner || { echo -e "${RED}Error: config.ner not found!${NC}"; exit 1; }
source sources.ner || { echo -e "${RED}Error: sources.ner not found!${NC}"; exit 1; }

declare -A current_dir
declare -A host_ports # To store host and port information

for host_port in "${HOSTS[@]}"; do
    IFS=: read host port <<< "$host_port"
    current_dir["$host"]="/root"
    host_ports["$host"]="$host:$port" # Store host:port information corresponding to the host
done

# temp data auto remover
trap 'rm -f "${outputs[@]}"' EXIT

# upload command history
history -r "$HISTORY_FILE"

while read -e -p "$(echo -e "${GREEN}shell # ${NC}")" -r cmd; do
    # Komutu geçmişe ekle
    history -s "$cmd"
    history -w "$HISTORY_FILE"

    [ -z "$cmd" ] && continue
    [ "$cmd" = "exit" ] && break

    if [[ "$cmd" = cd* ]]; then
        dir="${cmd#cd }"
        for host in "${!current_dir[@]}"; do
            host_port="${host_ports["$host"]}"
            IFS=: read _ port <<< "$host_port"
            ssh_command="ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no -p \"$port\" \"$USER@$host\" \"test -d \\\"$dir\\\"\""
            if [ -n "$PRIVATE_KEY_FILE" ]; then
                ssh_command="ssh -i \"$PRIVATE_KEY_FILE\" -o ConnectTimeout=3 -o StrictHostKeyChecking=no -p \"$port\" \"$USER@$host\" \"test -d \\\"$dir\\\"\""
            elif [ -n "$PASSWORD" ]; then
                ssh_command="sshpass -p \"$PASSWORD\" ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no -p \"$port\" \"$USER@$host\" \"test -d \\\"$dir\\\"\""
            else
                echo -e "${YELLOW}Error: Authentication information not found for $host${NC}"
                continue
            fi
            eval "$ssh_command" && current_dir["$host"]="$dir" || echo -e "${YELLOW}Warning: Directory $dir does not exist on $host${NC}"
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
            echo -e "${YELLOW}Error: Authentication information not found (password or private key not defined).${NC}"
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
        echo -e "${BLUE}----------- $(echo "$host_port" | cut -d':' -f1) -----------${NC}"
        # Print only hostname and '#' sign
        hostname=$(cat "${outputs["$host"]}" | head -n 1)
        echo -e "${GREEN}$hostname ${CYAN}#${NC}"
        # Skip the 'hostname' line and print the actual command output
        cat "${outputs["$host"]}" | tail -n +2
        echo -e "${BLUE}--------------------------------------------${NC}"
        rm "${outputs["$host"]}"
        first=false
    done
done
