export async function addResponse(path, statusCode, response, advanced) {
    const requestBody = {
        path,
        statusCode,
        response,
        advanced: {
            hangUp: advanced?.hangUp || false,
            timeout: advanced?.timeout || 0,
            rejectRequest: advanced?.rejectRequest || false,
            delay: advanced?.delay || 0
        }
    };

    console.log('Request body:', requestBody);  // Log the request body

    const res = await fetch('/api/response', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
        const error = await res.text();
        console.error('Server error:', error);  // Log the error response
        throw new Error(error || 'Failed to add response');
    }
}

export async function deleteResponse(path) {
    const res = await fetch(`/api/response?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete response');
}

export async function fetchResponses() {
    const res = await fetch('/api/responses');
    return res.json();
}

export async function fetchLogs() {
    const res = await fetch('/api/logs');
    return res.json();
}
