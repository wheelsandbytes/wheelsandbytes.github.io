all: build server

build:
	hugo -d public

server:
	hugo server -w -d public
