#!/usr/bin/env bash

mkdir -p ./volumes
mkdir -p ./volumes/postgres ./volumes/geth ./volumes/zksync/env/dev ./volumes/zksync/data
touch ./volumes/zksync/env.env

docker-compose --f ./network/docker-compose.yml rm -f
docker-compose --f ./network/docker-compose.yml up
