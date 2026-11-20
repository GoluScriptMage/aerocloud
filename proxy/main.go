package main

import (
	"database/sql"
	"fmt"
	_ "github.com/mattn/go-sqlite3"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
)

// Route Table to store the routes
type RouteTable struct {
	mu     sync.RWMutex
	routes map[string]int
}

// Intitialize the route table
func intitalizeRouteTable() *RouteTable {
	return &RouteTable{
		routes: make(map[string]int),
	}
}

// Thread-safe write
func (rt *RouteTable) Set(subDomain string, port int) {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	rt.routes[subDomain] = port
}

// Thread-safe read
func (rt *RouteTable) Get(subDomain string) (int, bool) {
	rt.mu.RLock()
	defer rt.mu.RUnlock()
	port, ok := rt.routes[subDomain]
	return port, ok
}

// Thread-safe delete
func (rt *RouteTable) Delete(subDomain string) {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	delete(rt.routes, subDomain)
}

// Handle the request and proxy it to the appropriate port based on the subdomain
func (rt *RouteTable) ProxyHandler(w http.ResponseWriter, r *http.Request) {
	// Step A: Get the subdomain from the request
	subDomain := strings.Split(r.Host, ".")[0]

	// Step B: Get the port from the route table & check if it exists
	port, exists := rt.Get(subDomain)
	if !exists {
		http.Error(w, "Subdomain not found", http.StatusNotFound)
		return
	}

	// Step C: Create a reverse proxy to forward the request to the appropriate port
	targetUrl, err := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", port))
	if err != nil {
		http.Error(w, "Error parsing target URL", http.StatusInternalServerError)
		return
	}

	// Step D: Create a reverse proxy worker and serve the request
	proxy := httputil.NewSingleHostReverseProxy(targetUrl)
	proxy.ServeHTTP(w, r)

}

// Handle the Hydaration of the route table and the proxying of requests
func (rt *RouteTable) HydrateFromDB(dbPath string) error {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return err
	}

	defer db.Close()

	rows, err := db.Query("SELECT subdomain, port FROM deployments WHERE port IS NOT NULL")
	if err != nil {
		return err
	}
	defer rows.Close() // Close the rows or req after each query

	// rows.next() is actually a loop that iterates the rows & return true till it ends
	for rows.Next() {
		var subDomain string
		var port int

		if err := rows.Scan(&subDomain, &port); err != nil {
			continue // Skip this row if there's an error
		}
		rt.Set(subDomain, port)
		fmt.Printf("Hydrated route: %s -> %d\n", subDomain, port)
	}

	return nil
}

func main() {
	table := intitalizeRouteTable()
	table.HydrateFromDB("../server/aerocloud.db") // Hydrate the route table from the database

	http.HandleFunc("/", table.ProxyHandler)


	// Start the HTTP server
	fmt.Println("Starting the HTTP Server...")
	http.ListenAndServe(":8080", nil)
}
