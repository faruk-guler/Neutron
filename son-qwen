#!/bin/bash

# Color definitions
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

# Banner
echo -e "${CYAN}###########################################################${NC}
${GREEN}# Neutron v4${NC}
# Lightweight and Powerful automation tool for Linux/Unix
# Author: faruk-guler
# Page: www.farukguler.com github.com/faruk-guler
${CYAN}###########################################################${NC}"

# History file
HISTORY_FILE="$HOME/.neutron_history"
touch "$HISTORY_FILE"

# Readline settings
if [[ $- == *i* ]]; then
    bind '"\e[A": history-search-backward'
    bind '"\e[B": history-search-forward'
    bind 'set show-all-if-ambiguous on'
    bind 'set completion-ignore-case on'
    bind 'TAB: menu-complete'
fi

# Load configs
source config.ner || { echo -e "${RED}Error: config.ner not found!${NC}"; exit 1; }
source sources.ner || { echo -e "${RED}Error: sources.ner not found!${NC}"; exit 1; }

# Initialize session data
declare -A current_dir host_ports

for host_port in "${HOSTS[@]}"; do
    IFS=: read host port <<< "$host_port"
    current_dir["$host"]="/root"
    host_ports["$host"]="$host:$port"
done

# Cleanup temp files on exit
trap 'rm -f "${outputs[@]}"' EXIT

# Load command history
history -r "$HISTORY_FILE"

# Main loop
while read -e -p "$(echo -e "${GREEN}shell # ${NC}")" -r cmd; do
    history -s "$cmd"
    history -w "$HISTORY_FILE"

    [ -z "$cmd" ] && continue
    [ "$cmd" = "exit" ] && break

    if [[ "$cmd" =~ ^cd ]]; then
        dir="${cmd#cd }"
        for host in "${!current_dir[@]}"; do
            IFS=: read _ port <<< "${host_ports[$host]}"
            ssh_base="ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no -p \"$port\" \"$USER@$host\""
            if [ -n "$PRIVATE_KEY_FILE" ]; then
                ssh_cmd="$ssh_base -i \"$PRIVATE_KEY_FILE\""
            elif [ -n "$PASSWORD" ]; then
                ssh_cmd="sshpass -p \"$PASSWORD\" $ssh_base"
            else
                echo -e "${YELLOW}Error: No auth method for $host${NC}"
                continue
            fi
            eval "$ssh_cmd \"test -d \\\"$dir\\\"\"" && current_dir["$host"]="$dir" || \
                echo -e "${YELLOW}Warning: Dir $dir not exist on $host${NC}"
        done
        continue
    fi

    unset -v jobs outputs
    declare -A jobs outputs

    for host in "${!current_dir[@]}"; do
        IFS=: read _ port <<< "${host_ports[$host]}"
        temp_file=$(mktemp)
        outputs["$host"]="$temp_file"

        ssh_base="ssh -n -o ConnectTimeout=3 -o StrictHostKeyChecking=no -p \"$port\" \"$USER@$host\""
        if [ -n "$PRIVATE_KEY_FILE" ]; then
            ssh_cmd="$ssh_base -i \"$PRIVATE_KEY_FILE\""
        elif [ -n "$PASSWORD" ]; then
            ssh_cmd="sshpass -p \"$PASSWORD\" $ssh_base"
        else
            echo -e "${YELLOW}Error: Auth missing for $host${NC}"
            continue
        fi

        remote_cmd="cd \"${current_dir[$host]}\" && hostname && $cmd"
        eval "$ssh_cmd \"$remote_cmd\" > \"$temp_file\" 2>&1 &"
        jobs["$host"]="$!"
    done

    first=true
    for host in "${!jobs[@]}"; do
        wait "${jobs[$host]}"
        host_port="${host_ports[$host]}"
        host_name=$(echo "$host_port" | cut -d':' -f1)

        if ! $first; then
            echo ""
        fi

        echo -e "${BLUE}----------- $host_name -----------${NC}"
        mapfile -t lines < "${outputs[$host]}"
        echo -e "${GREEN}${lines[0]} ${CYAN}#${NC}"
        printf "%s\n" "${lines[@]:1}"
        echo -e "${BLUE}--------------------------------------------${NC}"
        rm "${outputs[$host]}"
        first=false
    done
done
