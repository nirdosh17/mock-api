let openHeaderStates = new Set();

// Add this at the top of the file to track open states
const openDetailStates = new Set();

// Add these API functions at the top of script.js
async function addResponseToAPI(path, statusCode, response, advanced) {
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

    console.log('Request body:', requestBody);

    const res = await fetch('/api/response', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
        const error = await res.text();
        console.error('Server error:', error);
        throw new Error(error || 'Failed to add response');
    }
}

// Update the addNewResponse function to use the new API function
async function addNewResponse() {
    try {
        const path = document.getElementById('pathInput').value;
        if (!path) {
            showNotification('Path is required', true);
            return;
        }

        const statusCode = parseInt(document.getElementById('statusCodeInput').value) || 200;
        const response = document.getElementById('responseInput').value;

        // Get the selected advanced option
        const selectedOption = document.querySelector('input[name="advancedOption"]:checked')?.value;
        console.log('Selected option:', selectedOption);

        const advanced = {
            hangUp: selectedOption === 'hangup',
            rejectRequest: selectedOption === 'reject',
            delay: selectedOption === 'delay' ? (parseFloat(document.getElementById('delayInput').value) || 0) : 0
        };

        console.log('Advanced options:', advanced);

        await addResponseToAPI(path, statusCode, response, advanced);
        showNotification('Response added successfully');

        // Clear the form
        document.getElementById('pathInput').value = '';
        document.getElementById('statusCodeInput').value = '200';
        document.getElementById('responseInput').value = '';
        document.querySelectorAll('input[name="advancedOption"]').forEach(radio => radio.checked = false);
        document.getElementById('delayInput').value = '5';

        // Hide the form
        const addNewResponseForm = document.getElementById('addNewResponseForm');
        const addNewResponseToggle = document.getElementById('addNewResponseToggle');
        addNewResponseForm.classList.add('hidden');
        addNewResponseToggle.innerHTML = `
            Add New Response
            <svg class="w-5 h-5 ml-1 transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
        `;

        // Refresh the path responses
        fetchPathResponses();
    } catch (error) {
        console.error('Error adding response:', error);
        showNotification(error.message || 'Failed to add response', true);
    }
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
        // If str is already an object (like queryParams), stringify it first
        if (typeof str === 'object') {
            return JSON.stringify(str, null, 2);
        }
        // Otherwise try to parse it as JSON
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

// Update the formatHeaders function to handle long values better
function formatHeaders(headers) {
    // Convert headers object to a more readable format
    const formattedHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
        // If value is an array with one item, use that item directly
        // Otherwise keep it as an array
        formattedHeaders[key] = value.length === 1 ? value[0] : value;
    }
    return JSON.stringify(formattedHeaders, null, 2);
}

// Add a function to track existing logs
let currentLogs = new Map(); // Store logs by a unique identifier

function fetchLogs() {
    Promise.all([
        fetch('/api/logs').then(r => r.json()),
        fetch('/api/hanging-requests').then(r => r.json())
    ]).then(([logs, hangingRequests]) => {
        const logsDiv = document.getElementById('logs');

        // Store currently open details before updating
        const openDetails = new Set();
        document.querySelectorAll('details').forEach((details, index) => {
            if (details.open) {
                openDetails.add(index);
            }
        });

        // Convert hanging requests to log format
        const hangingLogs = hangingRequests.map(req => ({
            ...req,
            isHanging: true
        }));

        // Combine and sort all logs
        const allLogs = [...hangingLogs, ...logs].sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        logsDiv.innerHTML = allLogs.map(log => `
            <details class="bg-gray-50 dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4 overflow-hidden">
                <summary class="px-4 py-5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center">
                    <div class="flex items-center space-x-3">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            log.isHanging ? 'bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100'
                        }">
                            ${log.isHanging ? 'HANGING' : formatTime(log.timestamp)}
                        </span>
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100">
                            ${log.method}
                        </span>
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-800 text-violet-800 dark:text-violet-100">
                            ${log.path}
                        </span>
                        ${log.isHanging ? `
                            <button
                                onclick="handleHangingRequest('${log.id}', 'respond')"
                                class="inline-flex items-center px-2 py-1 text-xs font-medium rounded text-green-700 bg-green-100 hover:bg-green-200 dark:bg-green-800 dark:text-green-100 dark:hover:bg-green-700"
                            >
                                Respond
                            </button>
                            <button
                                onclick="handleHangingRequest('${log.id}', 'drop')"
                                class="inline-flex items-center px-2 py-1 text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 dark:bg-red-800 dark:text-red-100 dark:hover:bg-red-700"
                            >
                                Drop
                            </button>
                        ` : ''}
                    </div>
                    <div class="flex items-center">
                        ${!log.isHanging ? `
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                log.statusCode === 0 ? 'bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100' :
                                log.statusCode >= 200 && log.statusCode < 300 ? 'bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100' :
                                log.statusCode >= 400 ? 'bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100' :
                                'bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100'
                            }">${log.statusCode === 0 ? 'DROPPED' : log.statusCode}</span>
                        ` : ''}
                        <svg class="h-5 w-5 ml-2 text-gray-500 dark:text-gray-300 transform transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </summary>
                <div class="mt-2 px-4 pb-4 space-y-3">
                    <div>
                        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Headers</h4>
                        <pre class="mt-1 text-sm text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 p-2 rounded font-mono overflow-auto max-h-48">${formatHeaders(log.headers)}</pre>
                    </div>

                    ${log.queryParams ? `
                        <div>
                            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Query Parameters</h4>
                            <pre class="mt-1 text-sm text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 p-2 rounded font-mono overflow-auto max-h-48">${formatJSON(log.queryParams)}</pre>
                        </div>
                    ` : ''}

                    ${log.body ? `
                        <div>
                            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Request Body</h4>
                            <pre class="mt-1 text-sm text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 p-2 rounded font-mono overflow-auto max-h-48">${formatJSON(log.body)}</pre>
                        </div>
                    ` : ''}

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Direct IP</h4>
                            <p class="mt-1 text-sm text-gray-900 dark:text-gray-100 font-mono">${log.directIP}</p>
                        </div>
                        ${!log.isHanging ? `
                            <div>
                                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Forwarded IP</h4>
                                <p class="mt-1 text-sm text-gray-900 dark:text-gray-100 font-mono">${log.forwardedIP || 'N/A'}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </details>
        `).join('');

        // After rendering, restore open states
        document.querySelectorAll('details').forEach((details, index) => {
            if (openDetails.has(index)) {
                details.open = true;
                const icon = details.querySelector('svg');
                if (icon) {
                    icon.style.transform = 'rotate(180deg)';
                }
            }
        });

        // Update event listeners
        document.querySelectorAll('details').forEach((details, index) => {
            const summary = details.querySelector('summary');
            const icon = details.querySelector('svg');

            summary.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (e.target.closest('button')) {
                    return;
                }

                if (e.target === summary || e.target === icon || e.target.closest('svg') === icon) {
                    details.open = !details.open;
                    icon.style.transform = details.open ? 'rotate(180deg)' : 'rotate(0)';

                    // Store the open state
                    if (details.open) {
                        openDetails.add(index);
                    } else {
                        openDetails.delete(index);
                    }
                }
            });
        });
    });
}

function deletePathResponse(path) {
    if (path === '/') {
        showNotification('Cannot delete default path response', true);
        return;
    }

    fetch(`/api/response?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
    }).then(response => {
        if (!response.ok) {
            throw new Error('Failed to delete response');
        }
        showNotification('Response deleted successfully');
        fetchPathResponses(); // Refresh the list
    }).catch(error => {
        showNotification('Failed to delete response', true);
    });
}

// Add this function to handle radio button clicks
function handleRadioClick(event) {
    const radio = event.target;
    if (radio.type === 'radio' && radio.checked) {
        // Store the previous state
        const wasChecked = radio.dataset.wasChecked === 'true';

        // If it was already checked, uncheck it
        if (wasChecked) {
            radio.checked = false;
        }

        // Update the stored state
        radio.dataset.wasChecked = (!wasChecked).toString();
    }
}

// Update the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', () => {
    // ... existing initialization code ...

    // Set up Add New Response toggle
    const addNewResponseToggle = document.getElementById('addNewResponseToggle');
    const addNewResponseForm = document.getElementById('addNewResponseForm');

    addNewResponseToggle.innerHTML = `
        Add New Response
        <svg class="w-5 h-5 ml-1 transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
    `;

    addNewResponseToggle.addEventListener('click', () => {
        addNewResponseForm.classList.toggle('hidden');
        // Rotate the caret icon
        const caret = addNewResponseToggle.querySelector('svg');
        caret.style.transform = addNewResponseForm.classList.contains('hidden') ? '' : 'rotate(180deg)';
    });

    // Add click handlers for all radio buttons
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('click', handleRadioClick);
        radio.dataset.wasChecked = 'false';
    });

    // Update the advanced config content HTML
    const advancedConfigContent = document.getElementById('advancedConfigContent');
    advancedConfigContent.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-start">
                <div class="flex items-center h-5">
                    <input
                        id="hangUpInput"
                        type="radio"
                        name="advancedOption"
                        value="hangup"
                        class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                    >
                </div>
                <div class="ml-3">
                    <label for="hangUpInput" class="text-sm text-gray-700 dark:text-gray-300">
                        Hold request
                    </label>
                    <p class="text-xs text-gray-500 dark:text-gray-400">Repond or drop the request manually</p>
                </div>
            </div>

            <div class="flex items-start">
                <div class="flex items-center h-5">
                    <input
                        id="delayRadio"
                        type="radio"
                        name="advancedOption"
                        value="delay"
                        class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                    >
                    <div class="ml-3 flex items-center">
                        <label for="delayInput" class="text-sm text-gray-700 dark:text-gray-300">
                            Delay before response:
                        </label>
                        <input
                            id="delayInput"
                            type="number"
                            step="0.1"
                            min="0"
                            value="5"
                            class="focus:ring-indigo-500 w-20 text-indigo-600 border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white text-center mx-2 p-1"
                            oninput="document.getElementById('delayRadio').checked = true"
                        >
                        <span class="text-sm text-gray-700 dark:text-gray-300">seconds</span>
                    </div>
                </div>
            </div>

            <div class="flex items-start">
                <div class="flex items-center h-5">
                    <input
                        id="rejectRequestInput"
                        type="radio"
                        name="advancedOption"
                        value="reject"
                        class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                    >
                </div>
                <div class="ml-3">
                    <label for="rejectRequestInput" class="text-sm text-gray-700 dark:text-gray-300">
                        Do not accept request
                    </label>
                    <p class="text-xs text-gray-500 dark:text-gray-400">Close the connection immediately without response</p>
                </div>
            </div>
        </div>
    `;

    // Set up advanced config toggle
    const advancedConfigToggle = document.getElementById('advancedConfigToggle');
    const advancedConfigIcon = document.getElementById('advancedConfigIcon');

    advancedConfigToggle.addEventListener('click', () => {
        advancedConfigContent.classList.toggle('hidden');
        advancedConfigIcon.classList.toggle('rotate-180');
    });
});

// Update updatePathResponseFromList function to add click handlers to edit form radios
function updatePathResponseFromList(path, currentResponse, currentStatusCode, config) {
    const editForm = `
        <div class="space-y-4">
            <div class="grid grid-cols-6 gap-4">
                <div class="col-span-3">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Path</label>
                    <input
                        type="text"
                        class="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 font-mono h-11 bg-gray-50 dark:bg-gray-700 dark:text-white"
                        value="${path}"
                        disabled
                    />
                </div>
                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Status Code</label>
                    <input
                        type="number"
                        id="editStatusCode-${path}"
                        class="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 font-mono text-center h-11 bg-gray-50 dark:bg-gray-700 dark:text-white"
                        value="${currentStatusCode}"
                        min="100"
                        max="599"
                    />
                </div>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Response Body</label>
                <textarea
                    id="editResponse-${path}"
                    rows="5"
                    class="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 font-mono bg-gray-50 dark:bg-gray-700 dark:text-white"
                >${currentResponse}</textarea>
            </div>
            <div>
                <div class="border-t border-gray-200 dark:border-gray-700 mt-4 pt-4">
                    <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-4">Advanced Configuration</h3>
                    <div class="space-y-4">
                        <div class="flex items-start">
                            <div class="flex items-center h-5">
                                <input
                                    id="editHangUpInput-${path}"
                                    type="radio"
                                    name="editAdvancedOption-${path}"
                                    value="hangup"
                                    class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                                    ${config.advanced?.hangUp ? 'checked' : ''}
                                >
                            </div>
                            <div class="ml-3">
                                <label for="editHangUpInput-${path}" class="text-sm text-gray-700 dark:text-gray-300">
                                    Hold request
                                </label>
                                <p class="text-xs text-gray-500 dark:text-gray-400">Repond or drop the request manually</p>
                            </div>
                        </div>

                        <div class="flex items-start">
                            <div class="flex items-center h-5">
                                <input
                                    id="editDelayRadio-${path}"
                                    type="radio"
                                    name="editAdvancedOption-${path}"
                                    value="delay"
                                    class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                                    ${config.advanced?.delay ? 'checked' : ''}
                                >
                                <div class="ml-3 flex items-center">
                                    <label for="editDelayInput-${path}" class="text-sm text-gray-700 dark:text-gray-300">
                                        Delay before response:
                                    </label>
                                    <input
                                        id="editDelayInput-${path}"
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        value="${config.advanced?.delay || 5}"
                                        class="focus:ring-indigo-500 w-20 text-indigo-600 border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white text-center mx-2 p-1"
                                        oninput="document.getElementById('editDelayRadio-${path}').checked = true"
                                    >
                                    <span class="text-sm text-gray-700 dark:text-gray-300">seconds</span>
                                </div>
                            </div>
                        </div>

                        <div class="flex items-start">
                            <div class="flex items-center h-5">
                                <input
                                    id="editRejectRequestInput-${path}"
                                    type="radio"
                                    name="editAdvancedOption-${path}"
                                    value="reject"
                                    class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                                    ${config.advanced?.rejectRequest ? 'checked' : ''}
                                >
                            </div>
                            <div class="ml-3">
                                <label for="editRejectRequestInput-${path}" class="text-sm text-gray-700 dark:text-gray-300">
                                    Do not accept request
                                </label>
                                <p class="text-xs text-gray-500 dark:text-gray-400">Close the connection immediately without response</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex justify-end space-x-2">
                <button
                    onclick="cancelEdit('${path}')"
                    class="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                    Cancel
                </button>
                <button
                    onclick="saveEdit('${path}')"
                    class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                    Save Changes
                </button>
            </div>
        </div>
    `;

    document.getElementById(`response-${path}`).innerHTML = editForm;

    // Add click handlers for the new radio buttons
    document.querySelectorAll(`input[name="editAdvancedOption-${path}"]`).forEach(radio => {
        radio.addEventListener('click', handleRadioClick);
        radio.dataset.wasChecked = radio.checked.toString();
    });
}

function cancelEdit(path) {
    fetchPathResponses(); // Refresh the list to revert changes
}

function saveEdit(path) {
    const statusCode = parseInt(document.getElementById(`editStatusCode-${path}`).value) || 200;
    const response = document.getElementById(`editResponse-${path}`).value;

    const selectedOption = document.querySelector(`input[name="editAdvancedOption-${path}"]:checked`)?.value;
    const advanced = {
        hangUp: selectedOption === 'hangup',
        rejectRequest: selectedOption === 'reject',
        delay: selectedOption === 'delay' ? (parseFloat(document.getElementById(`editDelayInput-${path}`).value) || 0) : 0
    };

    fetch('/api/response', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            path,
            statusCode,
            response,
            advanced
        }),
    }).then(() => {
        showNotification('Response updated successfully');
        fetchPathResponses();
    }).catch(error => {
        showNotification('Failed to update response', true);
    });
}

// Update fetchPathResponses to not include hanging requests
function fetchPathResponses() {
    fetch('/api/responses').then(r => r.json())
        .then(responses => {
            const responsesDiv = document.getElementById('pathResponses');
            responsesDiv.innerHTML = Object.entries(responses).map(([path, config]) => {
                const escapedPath = path.replace(/"/g, '&quot;');
                return `
                <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex items-center space-x-2">
                            <div class="font-mono text-sm text-gray-900 dark:text-gray-100">${escapedPath}</div>
                            ${path !== '/' ? `
                                <button
                                    onclick="deletePathResponse('${escapedPath}')"
                                    class="inline-flex items-center p-1 border border-transparent rounded-full text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                    title="Delete response"
                                >
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            ` : ''}
                            <button
                                class="edit-button inline-flex items-center p-1 border border-transparent rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                title="Edit response"
                                data-path="${escapedPath}"
                                data-response="${config.body.replace(/"/g, '&quot;')}"
                                data-status="${config.statusCode}"
                            >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </button>
                        </div>
                        <span
                            class="status-badge inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                config.statusCode >= 200 && config.statusCode < 300 ? 'bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100' :
                                config.statusCode >= 400 ? 'bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100' :
                                'bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100'
                            } cursor-pointer"
                            data-path="${escapedPath}"
                            data-response="${config.body.replace(/"/g, '&quot;')}"
                            data-status="${config.statusCode}"
                        >
                            ${config.statusCode}
                        </span>
                    </div>
                    <div id="response-${escapedPath}">
                        <pre
                            class="response-area mt-2 text-sm text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 p-2 rounded font-mono cursor-pointer"
                            data-path="${escapedPath}"
                            data-response="${config.body.replace(/"/g, '&quot;')}"
                            data-status="${config.statusCode}"
                        >${config.body.trim() ? formatJSON(config.body) : '<span class="text-gray-500 dark:text-gray-400">blank string</span>'}</pre>
                    </div>
                </div>
            `;
            }).join('');

            // Add click handlers for edit buttons and response areas
            const handleEdit = (element) => {
                const path = element.dataset.path;
                const response = element.dataset.response;
                const statusCode = parseInt(element.dataset.status);
                updatePathResponseFromList(path, response, statusCode, responses[path]);
            };

            document.querySelectorAll('.edit-button, .response-area, .status-badge').forEach(element => {
                element.addEventListener('click', () => handleEdit(element));
            });
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

// Update the handleHangingRequest function
function handleHangingRequest(id, action) {
    // Disable and hide the buttons immediately
    const buttons = document.querySelectorAll(`button[onclick*="handleHangingRequest('${id}"]`);
    buttons.forEach(button => {
        button.disabled = true;
        button.style.display = 'none';
    });

    // Also hide the entire hanging request entry
    const requestEntry = buttons[0]?.closest('details');
    if (requestEntry) {
        requestEntry.style.display = 'none';
    }

    fetch('/api/hanging-request', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, action }),
    }).then(response => {
        if (!response.ok) {
            throw new Error(`Failed to ${action} request: ${response.status}`);
        }
        showNotification(`Request ${action}ed successfully`);

        // Wait a bit before updating the UI to ensure the connection is dropped
        setTimeout(() => {
            fetchLogs();
            fetchPathResponses();
        }, action === 'drop' ? 1000 : 0);
    }).catch(error => {
        console.error('Error:', error);
        showNotification(`Failed to ${action} request: ${error.message}`, true);
        // On error, show the buttons and request entry again
        buttons.forEach(button => {
            button.disabled = false;
            button.style.display = '';
        });
        if (requestEntry) {
            requestEntry.style.display = '';
        }
    });
}
