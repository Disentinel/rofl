// billing service (Go). The wire contract it CONSUMES is its request struct.
package main

import (
	"encoding/json"
	"net/http"
)

type ChargeRequest struct {
	OrderID string  `json:"order_id"`
	Amount  float64 `json:"amount"`
}

func main() {
	http.HandleFunc("/billing/charge", func(w http.ResponseWriter, r *http.Request) {
		var req ChargeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	http.ListenAndServe(":8081", nil)
}
