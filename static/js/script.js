// Update the addNewResponse function to include advanced options
async function addNewResponse() {
    const path = document.getElementById('pathInput').value;
    if (!path) {
        showNotification('Path is required', true);
        return;
    }

    const statusCode = parseInt(document.getElementById('statusCodeInput').value) || 200;
    const response = document.getElementById('responseInput').value;
    const advanced = {
        hangUp: document.getElementById('hangUpInput').checked,
        timeout: parseFloat(document.getElementById('timeoutInput').value) || 0,
        rejectRequest: document.getElementById('rejectRequestInput').checked,
    };

    try {
        await api.addResponse(path, statusCode, response, advanced);
        showNotification('Response added successfully');
        // Clear the form
        document.getElementById('pathInput').value = '';
        document.getElementById('statusCodeInput').value = '200';
        document.getElementById('responseInput').value = '';
        document.getElementById('hangUpInput').checked = false;
        document.getElementById('timeoutInput').value = '';
        document.getElementById('rejectRequestInput').checked = false;
        fetchPathResponses();
    } catch (error) {
        showNotification('Failed to add response', true);
    }
}
