#!/usr/bin/env bash

docker-compose --f ./network/docker-compose.yml down
rm -rf ./volumes
docker-compose --f ./network/docker-compose.yml pull
