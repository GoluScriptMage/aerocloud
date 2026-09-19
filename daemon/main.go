package main

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
)

// BitArr
var bitSet [1000]uint64
var mu sync.Mutex

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
	fmt.Println("Starting leasing")

	mu.Lock()
	defer mu.Unlock()

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

// ex. `RELEASE 4001`
func release(port int) {
	offSet := port - 4000

	// Out of range
	if offSet < 0 || (offSet/64) >= len(bitSet) {
		return
	}

	i := offSet / 64 // Gives the row
	j := offSet % 64 // Gives col

	// Locking to prevent corruption
	mu.Lock()
	defer mu.Unlock() // Unlock after done

	bitSet[i] = bitSet[i] &^ (1 << j) // Free the bit
}

// handle the connection
func handleConnection(conn net.Conn) {
	defer conn.Close()

	// Read line sent by client
	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		parts := strings.Split(line, " ")

		switch parts[0] {

		case "LEASE":
			port := lease()
			fmt.Fprintf(conn, "%d\n", port)

		case "RELEASE":
			if len(parts) > 1 {
				port, err := strconv.Atoi(parts[1])

				if err == nil {
					release(port)
					fmt.Fprintln(conn, "OK")
					continue
				}

			}
			fmt.Fprintln(conn, "ERR_INVALID_PORT")
		default:
			fmt.Fprintln(conn, "ERR_UNKNOWN_CMD")
		}
	}

	conn.Write([]byte("Hello from aerocloud"))
}
