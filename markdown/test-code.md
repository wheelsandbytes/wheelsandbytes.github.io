# Test your code on another server

In data structures, we need to test our code on a Linux machine before submission. There are two ways: (1) virtual machine and (2) ssh into our school server.

### Method 1

[Get Virtualbox.](https://www.virtualbox.org)
[Get Ubuntu.](http://www.ubuntu.com/download)
Install Ubuntu in Virtualbox.
Done.

### Method 2

Open up Terminal.

```
~$ ssh user@thunder.cise.ufl.edu
user@thunder.cise.ufl.edu's password:
Last login: Tue Jan 19 17:38:37 2016 from xx.xxx.xx.xxx
thunderx:1%
```
Grab your code using git clone:

```
thunderx:1% git clone https://github.com/username/project_name
```

Or wget, whatever floats your boat. Get your code to the server somehow.

```
thunderx:n% cd project_name
```

Compile with g++:

```
thunderx:n% g++ foo.cpp -o foo
thunderx:n% ./foo
```

Compile with gcc (if you're nuts):

```
thunderx:n% gcc -Wall -o foo foo.cpp -lstdc++
thunderx:n% ./foo
```
