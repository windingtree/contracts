#!/usr/bin/env bash

mkdir -p ./network/volumes
mkdir -p ./network/volumes/postgres ./network/volumes/geth ./network/volumes/zksync/env/dev ./network/volumes/zksync/data
touch ./network/volumes/zksync/env.env

docker-compose --f ./network/docker-compose.yml rm -f
docker-compose --f ./network/docker-compose.yml up
