# helpers

A Python API client library for making HTTP requests.

## Installation

```bash
pip install helpers
```

For development:

```bash
pip install -e ".[dev]"
```

## Usage

### Basic Usage

```python
from helpers import APIClient

# Create a client
client = APIClient("https://api.example.com")

# Make requests
response = client.get("/users")
data = response.json()

# POST request with JSON body
response = client.post("/users", json={"name": "John", "email": "john@example.com"})
```

### With Authentication

```python
client = APIClient("https://api.example.com")
client.set_auth_token("your-api-token")

# All subsequent requests will include the Authorization header
response = client.get("/protected/resource")
```

### Context Manager

```python
with APIClient("https://api.example.com") as client:
    response = client.get("/users")
    # Session is automatically closed when exiting the context
```

### Custom Headers

```python
client = APIClient(
    "https://api.example.com",
    headers={"X-Custom-Header": "value"}
)

# Or set headers after initialization
client.set_header("X-Another-Header", "another-value")
```

### Configuration Options

```python
client = APIClient(
    base_url="https://api.example.com",
    timeout=60,          # Request timeout in seconds
    retries=5,           # Number of retry attempts
    headers={"Accept": "application/json"}
)
```

## API Reference

### APIClient

- `get(endpoint, params=None, **kwargs)` - Make a GET request
- `post(endpoint, data=None, json=None, **kwargs)` - Make a POST request
- `put(endpoint, data=None, json=None, **kwargs)` - Make a PUT request
- `patch(endpoint, data=None, json=None, **kwargs)` - Make a PATCH request
- `delete(endpoint, **kwargs)` - Make a DELETE request
- `set_auth_token(token, prefix="Bearer")` - Set authorization header
- `set_header(key, value)` - Set a custom header
- `close()` - Close the session

## License

MIT
