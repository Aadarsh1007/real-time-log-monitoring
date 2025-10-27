# real-time-log-monitoring

curl to add log

curl --location 'http://localhost:3000/api/logs' \
--header 'Content-Type: application/json' \
--data '{"service":"auth-service","type":"info","message":"User login successful"}'


curl to get logs by filter

curl --location 'http://localhost:3000/api/logs?service=payment-service&type=info&from=2025-10-27T23%3A59%3A59Z&to=2025-10-28T23%3A59%3A59Z' \
--header 'Content-Type: application/json'


by opening index.html file in browser you can see the frontend where you can subscribe the logs of service and see the logs.
