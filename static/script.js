let openHeaderStates = new Set();

function updateResponse() {
    const path = document.getElementById('pathInput').value || '/';
    const statusCode = parseInt(document.getElementById('statusCodeInput').value) || 200;
    const response = document.getElementById('responseInput').value;

    fetch('/api/response', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            path,
            statusCode,
            response
        }),
    }).then(() => {
        showNotification('Response updated successfully');
        fetchPathResponses(); // Refresh the responses list
    }).catch(error => {
        showNotification('Failed to update response', true);
    });
}

function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = `fixed right-4 bottom-4 px-4 py-2 rounded-md text-sm ${
        isError
            ? 'bg-red-50 dark:bg-red-900 text-red-800 dark:text-red-100 border border-red-200 dark:border-red-800'
            : 'bg-green-50 dark:bg-green-900 text-green-800 dark:text-green-100 border border-green-200 dark:border-green-800'
    } transition-all duration-300 shadow-lg`;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Fade and slide in from right
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    });

    // Fade and slide out to right
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

function formatJSON(str) {
    try {
        return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
        return str;
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

function formatHeaders(headers) {
    // Convert headers object to a more readable format
    const formattedHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
        formattedHeaders[key] = value.length === 1 ? value[0] : value;
    }
    return JSON.stringify(formattedHeaders, null, 2);
}

function fetchLogs() {
    fetch('/api/logs')
        .then(response => response.json())
        .then(logs => {
            // Sort logs in descending order by timestamp
            logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            const logsDiv = document.getElementById('logs');

            // Store current scroll position
            const scrollPos = logsDiv.scrollTop;

            logsDiv.innerHTML = logs.map((log, index) => `
                <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div class="flex justify-between items-start mb-4">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100">
                            ${formatTime(log.timestamp)}
                        </span>
                        <div class="flex space-x-2">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                log.method === 'GET' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100' :
                                log.method === 'POST' ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100' :
                                log.method === 'PUT' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100' :
                                log.method === 'DELETE' ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100' :
                                'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100'
                            }">${log.method}</span>
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-100 font-mono">
                                ${log.path}
                            </span>
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                log.statusCode >= 200 && log.statusCode < 300 ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100' :
                                log.statusCode >= 400 ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100' :
                                'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100'
                            }">${log.statusCode}</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <div>
                            <span class="text-gray-500 dark:text-gray-400">Direct IP:</span>
                            <span class="text-gray-900 dark:text-gray-100 ml-2 font-mono">${log.directIP}</span>
                        </div>
                        <div>
                            <span class="text-gray-500 dark:text-gray-400">Forwarded IP:</span>
                            <span class="text-gray-900 dark:text-gray-100 ml-2 font-mono">${log.forwardedIP || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="mb-3">
                        <span class="text-gray-500 dark:text-gray-400 text-sm">Response:</span>
                        <pre class="mt-1 text-sm text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 p-2 rounded font-mono">${formatJSON(log.response)}</pre>
                    </div>
                    <details class="group" id="headers-${index}" ${openHeaderStates.has(index) ? 'open' : ''}>
                        <summary class="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none">
                            Headers
                            <span class="ml-1 text-gray-400 group-open:hidden">▼</span>
                            <span class="ml-1 text-gray-400 hidden group-open:inline">▲</span>
                        </summary>
                        <div class="mt-2 bg-gray-100 dark:bg-gray-700 rounded-md p-2 overflow-x-auto">
                            <pre class="text-sm text-gray-900 dark:text-gray-100 font-mono whitespace-pre">${formatHeaders(log.headers)}</pre>
                        </div>
                    </details>
                </div>
            `).join('');

            // Restore scroll position
            logsDiv.scrollTop = scrollPos;

            // Add click handlers with proper state management
            document.querySelectorAll('details').forEach((details, index) => {
                details.addEventListener('click', (e) => {
                    if (e.target.closest('summary')) {
                        e.preventDefault();
                        e.stopPropagation();

                        if (details.open) {
                            openHeaderStates.delete(index);
                        } else {
                            openHeaderStates.add(index);
                        }

                        details.open = !details.open;
                    }
                });

                // Prevent closing on content click
                details.querySelector('.mt-2')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
            });
        });
}

function fetchPathResponses() {
    fetch('/api/responses')
        .then(response => response.json())
        .then(responses => {
            const responsesDiv = document.getElementById('pathResponses');
            responsesDiv.innerHTML = Object.entries(responses).map(([path, config]) => `
                <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div class="flex justify-between items-start mb-2">
                        <div class="font-mono text-sm text-gray-900 dark:text-gray-100">${path}</div>
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100">
                            ${config.statusCode}
                        </span>
                    </div>
                    <pre class="mt-2 text-sm text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 p-2 rounded font-mono">${config.body.trim() ? formatJSON(config.body) : '<span class="text-gray-500 dark:text-gray-400">blank string</span>'}</pre>
                </div>
            `).join('');
        });
}

// Update the interval to be longer to reduce UI flicker
clearInterval(window.logsInterval); // Clear any existing interval
window.logsInterval = setInterval(fetchLogs, 5000); // Refresh every 5 seconds instead of 2
fetchLogs(); // Initial fetch

// Initial fetch of path responses
fetchPathResponses();

// Add at the top of the file
function initTheme() {
    // On page load or when changing themes, best to add inline in `head` to avoid FOUC
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

// Call on page load
initTheme();

// Add theme toggle handler
document.getElementById('themeToggle').addEventListener('click', () => {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.theme = 'light';
    } else {
        document.documentElement.classList.add('dark');
        localStorage.theme = 'dark';
    }
});