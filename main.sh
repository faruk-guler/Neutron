#!/bin/bash

source config.sh
source sources.sh

command_loop() {
  while true; do
    read -p "shell # " CMD
    if [[ "$CMD" == "exit" ]]; then
      break
    fi
    if [[ -z "$CMD" ]]; then
      continue
    fi

    for HOST in "${HOSTS[@]}"; do
      echo "------------------------------------"
      echo "$HOST:$PORT"
      echo "output #"
      sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -p $PORT $USER@$HOST "$CMD"
    done
  done
}

command_loop
