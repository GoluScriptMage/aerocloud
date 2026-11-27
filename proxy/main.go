package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"

	_ "github.com/mattn/go-sqlite3"
)

// Route Table to store the routes
type RouteTable struct {
	mu     sync.RWMutex
	routes map[string]int
}

// Struct for AddRouteRequest
type AddRouteRequest struct {
	SubDomain string `json:"subDomain"`
	Port      int    `json:"port"`
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
	fmt.Println("Getting a req")

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

// POST /routes
func (rt *RouteTable) AddRouteHandler(w http.ResponseWriter, r *http.Request) {

	// Step A: Decode the body into req with subdomain & port
	var req AddRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	fmt.Printf("Adding route: %s -> %d\n", req.SubDomain, req.Port)

	// Step B: Addthe route data in routeTable
	if req.SubDomain == "" || req.Port <= 0 {
		http.Error(w, "Invalid subdomain or port", http.StatusBadRequest)
		return
	}
	rt.Set(req.SubDomain, req.Port)
	w.WriteHeader(http.StatusCreated)
	w.Write([]byte("Route added successfully"))
}

// GET /routes/{subdomain}
func (rt *RouteTable) DeleteRouteHandler(w http.ResponseWriter, r *http.Request) {
	// Step A: Extract the subdomain from the url path & check if it exists
	subDomain := r.PathValue("subdomain")
	if subDomain == "" {
		http.Error(w, "Subdomain not provided", http.StatusBadRequest)
		return
	}

	rt.Delete(subDomain)

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Route deleted successfully"))
}

func (rt *RouteTable) HealthRouteHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Proxy Server running"))
}

func main() {
	table := intitalizeRouteTable()
	table.HydrateFromDB("../server/aerocloud.db") // Hydrate the route table from the database

	// 1. Admin Mux for Control Plane
	adminMux := http.NewServeMux()
	adminMux.HandleFunc("POST /routes", table.AddRouteHandler)
	adminMux.HandleFunc("DELETE /routes/{subdomain}", table.DeleteRouteHandler)
	adminMux.HandleFunc("GET /routes/health", table.HealthRouteHandler)

	// 2. Start the admin server in goRoutine
	go func() {
		fmt.Println("Admin Plane server running on port :8081")
		if err := http.ListenAndServe(":8081", adminMux); err != nil {
			log.Fatalf("Admin server failed: %v", err)
		}
	}()

	// 3. Proxy Mux for Data Plane
	proxyMux := http.NewServeMux()
	proxyMux.HandleFunc("/", table.ProxyHandler)

	// 4. Start the proxy server
	fmt.Println("Proxy server running on port :8080")
	if err := http.ListenAndServe(":8080", proxyMux); err != nil {
		log.Fatalf("Proxy server failed: %v", err)
	}
}
