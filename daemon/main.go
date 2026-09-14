package main

import (
	"fmt"
	"net"
	"os"
)

// BitArr
var bitSet [1000]uint64

const socketPath = "/tmp/aerocloud.sock" // Machine root socket path

func main() {
	// 1. Remove the socket if old exists
	os.Remove(socketPath)

	// 2. Start the unix server
	fmt.Println("Starting the unix server...")
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		panic(err)
	}

	// 3. Accept connections
	for listener != nil {
		conn, err := listener.Accept()
		if err != nil {
			fmt.Println("Can't connect to the server")
		}
		// 4. Handle the connection using a goroutine
		go handleConnection(conn)
	}
}

func lease() int {
	for i := 0; i < len(bitSet); i++ {
		for j := 0; j < 64; j++ {
			// Not empty
			if (bitSet[i] & (1 << j)) != 0 {
				continue
			} else {
				// Mark as used
				bitSet[i] = bitSet[i] | (1 << j)
				x := 4000 + i*64 + j
				return x
			}
		}
	}
	return -1
}

// handle the connection
func handleConnection(conn net.Conn) {
	defer conn.Close()
	println("We got some req", (lease()))

	fmt.Print("We got some req", (conn))

	conn.Write([]byte("Hello from aerocloud"))
}
