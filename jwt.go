package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

// Endpoints
const authEndpoint = "https://learn.reboot01.com/api/auth/signin"
const graphqlEndpoint = "https://learn.reboot01.com/api/graphql-engine/v1/graphql"

// Credentials holds the username and password for authentication.
type Credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// GraphQLRequest represents the structure of a GraphQL request.
type GraphQLRequest struct {
	Query string `json:"query"`
}

// GraphQLResponse represents the response structure.
type GraphQLResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

// getJWT authenticates and retrieves the JWT using Basic Auth.
func getJWT(endpoint, username, password string) (string, error) {
	req, err := http.NewRequest("POST", endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %v", err)
	}
	auth := base64.StdEncoding.EncodeToString([]byte(username + ":" + password))
	req.Header.Set("Authorization", "Basic "+auth)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("authentication failed with status %d: %s", resp.StatusCode, string(body))
	}

	respStr := strings.Trim(string(body), "\"")
	if strings.Contains(respStr, ".") {
		return respStr, nil
	}

	return "", fmt.Errorf("no JWT found in response: %s", string(body))
}

// decodeJWT decodes and prints the header and payload of a JWT.
func decodeJWT(jwt string) error {
	parts := strings.Split(jwt, ".")
	if len(parts) != 3 {
		return fmt.Errorf("invalid JWT: must have 3 parts")
	}

	// Decode header
	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return fmt.Errorf("failed to decode header: %v", err)
	}
	var header map[string]interface{}
	json.Unmarshal(headerBytes, &header)
	headerJSON, _ := json.MarshalIndent(header, "", "  ")
	fmt.Println("JWT Header:")
	fmt.Println(string(headerJSON))

	// Decode payload
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return fmt.Errorf("failed to decode payload: %v", err)
	}
	var payload map[string]interface{}
	json.Unmarshal(payloadBytes, &payload)
	payloadJSON, _ := json.MarshalIndent(payload, "", "  ")
	fmt.Println("\nJWT Payload:")
	fmt.Println(string(payloadJSON))

	return nil
}

// queryGraphQL sends a GraphQL query using the JWT and returns the data.
func queryGraphQL(endpoint, jwt, query string) (string, error) {
	reqBody := GraphQLRequest{Query: query}
	payloadBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal query: %v", err)
	}

	req, err := http.NewRequest("POST", endpoint, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+jwt)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %v", err)
	}

	var gqlResp GraphQLResponse
	if err := json.Unmarshal(body, &gqlResp); err != nil {
		return "", fmt.Errorf("failed to parse response: %v", err)
	}

	if len(gqlResp.Errors) > 0 {
		return "", fmt.Errorf("GraphQL errors: %v", gqlResp.Errors)
	}

	var prettyJSON bytes.Buffer
	json.Indent(&prettyJSON, gqlResp.Data, "", "  ")
	return prettyJSON.String(), nil
}

func main() {
	// Define command-line flags
	username := flag.String("username", "", "Username for authentication")
	password := flag.String("password", "", "Password for authentication")
	query := flag.String("query", `
		query GetUserInfo {
			user(where: {id: {_eq: "767"}}) {
				id
				login
				email
				firstName
				lastName
				campus
				auditRatio
				totalUp
				totalDown
				audits
			}
		}
	`, "GraphQL query to execute")
	flag.Parse()

	// Prompt for username and password if not provided
	if *username == "" {
		fmt.Print("Enter username: ")
		fmt.Scanln(username)
	}
	if *password == "" {
		fmt.Print("Enter password: ")
		fmt.Scanln(password)
	}

	// Step 1: Get the JWT
	fmt.Println("Authenticating...")
	jwt, err := getJWT(authEndpoint, *username, *password)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error getting JWT: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("JWT:", jwt)

	// Step 2: Decode the JWT
	fmt.Println("\nDecoding JWT...")
	if err := decodeJWT(jwt); err != nil {
		fmt.Fprintf(os.Stderr, "Error decoding JWT: %v\n", err)
		os.Exit(1)
	}

	// Step 3: Query GraphQL endpoint for data
	fmt.Println("\nQuerying GraphQL endpoint for data...")
	result, err := queryGraphQL(graphqlEndpoint, jwt, *query)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error querying GraphQL: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("GraphQL Data:")
	fmt.Println(result)
}
