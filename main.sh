#!/bin/bash

# Color definitions
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

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

# Readline settings (for interactive shell)
# These settings provide features like history search and tab completion.
if [[ $- == *i* ]]; then
    bind '"\e[A": history-search-backward' # Up arrow: search history backward
    bind '"\e[B": history-search-forward'  # Down arrow: search history forward
    bind 'set show-all-if-ambiguous on'    # Show all options when tab completing
    bind 'set completion-ignore-case on'   # Case-insensitive tab completion
    bind 'TAB: menu-complete'              # Menu completion with Tab
fi

# Load configuration files
# 'config.ner' contains SSH credentials (USER, PRIVATE_KEY_FILE).
# 'sources.ner' contains the list of hosts (HOSTS) to connect to.
source config.ner || { echo -e "${RED}Error: config.ner not found! Please create it and enter your SSH credentials.${NC}"; exit 1; }
source sources.ner || { echo -e "${RED}Error: sources.ner not found! Please create it and enter your server list.${NC}"; exit 1; }

# Initialize session data
# 'current_dir': Stores the current directory for each host.
# 'host_ports': Maps hostnames to their host:port combinations.
declare -A current_dir host_ports

for host_port in "${HOSTS[@]}"; do
    IFS=: read host port <<< "$host_port" # Split host and port
    current_dir["$host"]="/root"          # Default starting directory for each host is '/root'
    host_ports["$host"]="$host:$port"     # Map host to its host:port
done

# Clean up temporary files on exit
# Ensures that all created temporary output files are removed when the script exits,
# regardless of whether it's a normal exit, an error, or a Ctrl+C interruption.
trap 'rm -f "${outputs[@]}"' EXIT

# Load command history
# Loads previously entered commands from the .neutron_history file into memory.
history -r "$HISTORY_FILE"

# Main loop
# Prompts the user for a command, processes it, and displays the output.
while read -e -p "$(echo -e "${GREEN}shell # ${NC}")" -r cmd; do
    history -s "$cmd" # Add the command to history
    history -w "$HISTORY_FILE" # Write history to file

    [ -z "$cmd" ] && continue # If command is empty, skip to next iteration
    [ "$cmd" = "exit" ] && break # If command is "exit", break out of the loop

    # Handle "cd" command
    if [[ "$cmd" =~ ^cd ]]; then
        dir="${cmd#cd }" # Extract the directory from the "cd " command
        for host in "${!current_dir[@]}"; do
            IFS=: read _ port <<< "${host_ports[$host]}"
            # Base SSH connection command
            # -o ConnectTimeout=3: Sets connection timeout to 3 seconds.
            # -o StrictHostKeyChecking=no: Disables strict host key checking (use with caution).
            ssh_base="ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no -p \"$port\" \"$USER@$host\""
            
            # Only private key file authentication is used
            if [ -n "$PRIVATE_KEY_FILE" ]; then
                ssh_cmd="$ssh_base -i \"$PRIVATE_KEY_FILE\""
            else
                # If PRIVATE_KEY_FILE is not defined, show an error and skip this host.
                echo -e "${YELLOW}Error: No private key file specified for $host! Set PRIVATE_KEY_FILE in config.ner.${NC}"
                continue # Skip to the next host
            fi
            
            # Test if the directory exists on the remote server and update the current directory.
            # 'test -d "$dir"': Returns true if the directory exists.
            eval "$ssh_cmd \"test -d \\\"$dir\\\"\"" && current_dir["$host"]="$dir" || \
                echo -e "${YELLOW}Warning: Directory $dir does not exist on $host.${NC}"
        done
        continue # After handling 'cd', return to the beginning of the loop
    fi

    # Handle all other commands
    unset -v jobs outputs # Clear previous job and output arrays
    declare -A jobs outputs

    # Execute the command concurrently on each host
    for host in "${!current_dir[@]}"; do
        IFS=: read _ port <<< "${host_ports[$host]}"
        temp_file=$(mktemp) # Create a temporary output file (secure, unique name)
        outputs["$host"]="$temp_file" # Map the host to its output file path

        # Base SSH connection command
        # -n: Prevents reading stdin from /dev/null.
        ssh_base="ssh -n -o ConnectTimeout=3 -o StrictHostKeyChecking=no -p \"$port\" \"$USER@$host\""
        
        # Only private key file authentication is used
        if [ -n "$PRIVATE_KEY_FILE" ]; then
            ssh_cmd="$ssh_base -i \"$PRIVATE_KEY_FILE\""
        else
            # If PRIVATE_KEY_FILE is not defined, show an error and skip this host.
            echo -e "${YELLOW}Error: No private key file specified for $host! Set PRIVATE_KEY_FILE in config.ner.${NC}"
            continue # Skip to the next host
        fi

        # Command string to be executed on the remote server:
        # 1. Change to the determined 'current_dir'.
        # 2. Print the hostname (will be the first line of output).
        # 3. Execute the actual user command.
        remote_cmd="cd \"${current_dir[$host]}\" && hostname && $cmd"
        # Execute the command in the background ('&') and redirect all output to the temporary file.
        eval "$ssh_cmd \"$remote_cmd\" > \"$temp_file\" 2>&1 &"
        jobs["$host"]="$!" # Store the PID of the background job
    done

    # Wait for all jobs to complete and display outputs
    first=true # Control flag for output formatting (adds empty line between hosts)
    for host in "${!jobs[@]}"; do
        wait "${jobs[$host]}" # Wait for the specific job to complete

        host_port="${host_ports[$host]}"
        host_name=$(echo "$host_port" | cut -d':' -f1) # Get the host name (IP/domain part only)

        if ! $first; then
            echo "" # Add an empty line after the first output for visual separation
        fi

        echo -e "${BLUE}----------- $host_name -----------${NC}" # Host name header
        mapfile -t lines < "${outputs[$host]}" # Read all lines from the temporary file into an array
        echo -e "${GREEN}${lines[0]} ${CYAN}#${NC}" # Display the first line (hostname) in green with a '#'
        printf "%s\n" "${lines[@]:1}" # Print the remaining output lines
        echo -e "${BLUE}--------------------------------------------${NC}" # Closing line
        rm "${outputs[$host]}" # Delete the temporary file (will also be handled by trap on exit)
        first=false
    done
done
