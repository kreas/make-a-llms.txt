#!/bin/bash

# Default User ID is 1 if not provided
USER_ID=${1:-1}

echo "=========================================="
echo "Testing Stripe Webhook Locally"
echo "=========================================="
echo "Simulating 'checkout.session.completed' event"
echo "Target User ID: $USER_ID"
echo "------------------------------------------"

curl -i -X POST http://localhost:4242/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -H "x-stripe-mock: true" \
  -d "{
    \"type\": \"checkout.session.completed\",
    \"data\": {
      \"object\": {
        \"customer\": \"cus_mock_$(date +%s)\",
        \"subscription\": \"sub_mock_$(date +%s)\",
        \"priceId\": \"price_pro_mock_123\",
        \"status\": \"active\",
        \"metadata\": {
          \"userId\": \"$USER_ID\"
        }
      }
    }
  }"

echo -e "\n------------------------------------------"
echo "Webhook request complete."
echo "Check your SQLite db or application UI to verify User ID $USER_ID is now upgraded to Pro!"
echo "=========================================="
