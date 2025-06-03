// AWS-Konfiguration
AWS.config.update({
    region: "eu-central-1",
    accessKeyId: "REDACTED_AWS_ACCESS_KEY_ID_ROTATE",
    secretAccessKey: "REDACTED_AWS_SECRET_ACCESS_KEY_ROTATE"
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const requestTableBody = document.getElementById('requestTableBody');
const addRequestForm = document.getElementById('addRequestForm');
const nameSearchInput = document.getElementById('nameSearch');

// Modal-Elemente
const modal = document.getElementById('detailModal');
const closeModalButton = document.getElementById('closeModal');
const modalDetails = document.getElementById('modalDetails');
const commentsList = document.getElementById('commentsList');
const commentForm = document.getElementById('commentForm');
const commentInput = document.getElementById('commentInput');

let requests = [];
let currentRequestID = null; // Verfolgt die aktuell geöffnete Anfrage

// DOMContentLoaded Event
document.addEventListener('DOMContentLoaded', function () {
    console.log("DOM fully loaded and parsed.");
    loadRequestsFromDynamoDB();

    // Event-Listener setzen
    if (addRequestForm) {
        addRequestForm.addEventListener('submit', handleFormSubmit);
    }
    if (requestTableBody) {
        requestTableBody.addEventListener('click', handleTableClick);
    }
    if (nameSearchInput) {
        nameSearchInput.addEventListener('input', updateRequestTable);
    }
    if (closeModalButton) {
        closeModalButton.addEventListener('click', closeModal);
    }
    if (commentForm) {
        commentForm.addEventListener('submit', handleCommentSubmit);
    }
});

// Anfragen aus DynamoDB laden
async function loadRequestsFromDynamoDB() {
    const params = {
        TableName: 'Requests',
        FilterExpression: '#status = :statusVal',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':statusVal': 'open'
        }
    };

    try {
        const data = await dynamodb.scan(params).promise();
        requests = data.Items || [];
        updateRequestTable();
    } catch (err) {
        console.error("Error loading requests from DynamoDB:", err);
    }
}

// Tabelle aktualisieren
function updateRequestTable() {
    const searchTerm = nameSearchInput.value.toLowerCase();
    const rows = requests
        .filter(request => {
            return request.status === 'open' && Object.values(request).some(value =>
                String(value).toLowerCase().includes(searchTerm)
            );
        })
        .map((request, index) => {
            const images = request.imageUrls ? JSON.parse(request.imageUrls).map(url => `<img src="${url}" alt="Image" width="100">`).join('') : '';
            return `<tr>
                    <td>${request.requestDate || ''}</td>
                    <td>${request.name || ''}</td>
                    <td>${request.phone || ''}</td>
                    <td>${request.mushroom || ''}</td>
                    <td>${request.requestReason || ''}</td>
                    <td>
                        <button class="details" data-request-id="${request.RequestID}">Details anzeigen</button>
                        <button class="complete" data-index="${index}">Complete</button>
                        <button class="edit" data-index="${index}">Bearbeiten</button>
                    </td>
                </tr>`;
        }).join('');
    requestTableBody.innerHTML = rows;
}

// Form-Submit-Handler
async function handleFormSubmit(event) {
    event.preventDefault();
    const isEdit = addRequestForm.dataset.isEdit === 'true';
    await addOrUpdateRequest(isEdit);
}

// Tabellenklick-Handler
function handleTableClick(event) {
    const target = event.target;
    if (target.tagName === 'BUTTON') {
        const index = parseInt(target.dataset.index, 10);
        if (target.classList.contains('edit')) {
            prepareEditForm(index);
        } else if (target.classList.contains('complete')) {
            completeRequest(index);
        } else if (target.classList.contains('details')) {
            const requestID = target.getAttribute('data-request-id');
            openModal(requestID);
        }
    }
}

// Modal öffnen
function openModal(requestID) {
    currentRequestID = requestID;
    modal.classList.add('active'); // Zeigt das Modal an
    loadRequestDetails(requestID);
}

// Modal schließen
function closeModal() {
    modal.classList.remove('active'); // Versteckt das Modal
    modalDetails.innerHTML = ''; // Löscht den Inhalt
    commentsList.innerHTML = ''; // Löscht Kommentare
}

// Details der Anfrage laden
async function loadRequestDetails(requestID) {
    const params = {
        TableName: 'Requests',
        Key: { RequestID: requestID }
    };

    try {
        const data = await dynamodb.get(params).promise();
        const request = data.Item;

        if (request) {
            modalDetails.innerHTML = `
                <p><strong>Datum:</strong> ${request.requestDate || 'Keine Angabe'}</p>
                <p><strong>Name:</strong> ${request.name || 'Keine Angabe'}</p>
                <p><strong>PLZ:</strong> ${request.mushroom || 'Keine Angabe'}</p>
                <p><strong>Ort:</strong> ${request.location || 'Keine Angabe'}</p>
                <p><strong>Grund:</strong> ${request.requestReason || 'Keine Angabe'}</p>
                <p><strong>E-Mail:</strong> ${request.email || 'Keine Angabe'}</p>
                <p><strong>Telefon:</strong> ${request.phone || 'Keine Angabe'}</p>
                <p><strong>Zusätzliche Informationen:</strong> ${request.additionalInfo || 'Keine Angabe'}</p>
            `;
            renderComments(request.comment || []);
        }
    } catch (err) {
        console.error('Error loading request details:', err);
    }
}

// Kommentare anzeigen
function renderComments(comments) {
    commentsList.innerHTML = comments.map(comment => `
        <li>
            <p><strong>${comment.author || 'Unbekannt'}:</strong> ${comment.content}</p>
            <p><small>${new Date(comment.timestamp).toLocaleString()}</small></p>
        </li>
    `).join('');
}

// Kommentar hinzufügen
async function handleCommentSubmit(event) {
    event.preventDefault();

    const newComment = {
        timestamp: new Date().toISOString(),
        author: 'Benutzer',
        content: commentInput.value
    };

    try {
        const params = {
            TableName: 'Requests',
            Key: { RequestID: currentRequestID },
            UpdateExpression: 'SET #comment = list_append(if_not_exists(#comment, :emptyList), :newComment)',
            ExpressionAttributeNames: {
                '#comment': 'comment'
            },
            ExpressionAttributeValues: {
                ':emptyList': [],
                ':newComment': [newComment]
            },
            ReturnValues: 'UPDATED_NEW'
        };

        const data = await dynamodb.update(params).promise();
        renderComments(data.Attributes.comment);
        commentInput.value = '';
    } catch (err) {
        console.error('Error adding comment:', err);
    }
}

// Bearbeitungsformular vorbereiten
function prepareEditForm(index) {
    const request = requests[index];
    Object.keys(request).forEach(key => {
        const input = addRequestForm.querySelector(`[name="${key}"]`);
        if (input) input.value = request[key];
    });

    addRequestForm.dataset.isEdit = 'true';
    addRequestForm.dataset.index = index;
    document.querySelector('#addRequestForm button[type="submit"]').textContent = 'Änderungen speichern';
}

// Neue Anfrage hinzufügen oder aktualisieren
async function addOrUpdateRequest(isEdit) {
    const formData = new FormData(addRequestForm);
    const request = isEdit ? requests[parseInt(addRequestForm.dataset.index, 10)] : { RequestID: Date.now().toString(), status: 'open' };

    formData.forEach((value, key) => {
        request[key] = value;
    });

    if (isEdit) {
        await updateRequestInDynamoDB(request);
    } else {
        await addRequestToDynamoDB(request);
    }
}

// Anfrage speichern
async function addRequestToDynamoDB(request) {
    const params = {
        TableName: 'Requests',
        Item: request
    };

    try {
        await dynamodb.put(params).promise();
        requests.push(request);
        updateRequestTable();
        resetForm();
    } catch (err) {
        console.error('Error adding request:', err);
    }
}

// Anfrage in DynamoDB aktualisieren
async function updateRequestInDynamoDB(request) {
    const params = {
        TableName: 'Requests',
        Key: { RequestID: request.RequestID },
        UpdateExpression: 'SET #name = :name, phone = :phone, email = :email, #location = :location, mushroom = :mushroom, requestReason = :requestReason, timeFrame = :timeFrame, additionalInfo = :additionalInfo',
        ExpressionAttributeNames: {
            '#name': 'name',
            '#location': 'location'
        },
        ExpressionAttributeValues: {
            ':name': request.name,
            ':phone': request.phone,
            ':email': request.email,
            ':location': request.location,
            ':mushroom': request.mushroom,
            ':requestReason': request.requestReason,
            ':timeFrame': request.timeFrame,
            ':additionalInfo': request.additionalInfo
        },
        ReturnValues: 'UPDATED_NEW'
    };

    try {
        const data = await dynamodb.update(params).promise();
        console.log('Request updated successfully:', data);
        updateRequestTable();
        resetForm();
    } catch (err) {
        console.error('Error updating request:', err);
    }
}

// Formular zurücksetzen
function resetForm() {
    addRequestForm.reset();
    delete addRequestForm.dataset.isEdit;
    delete addRequestForm.dataset.index;
    document.querySelector('#addRequestForm button[type="submit"]').textContent = 'Anfrage hinzufügen';
}

// Anfrage als erledigt markieren
async function completeRequest(index) {
    const request = requests[index];
    request.status = 'completed';

    const params = {
        TableName: 'Requests',
        Key: { RequestID: request.RequestID },
        UpdateExpression: 'SET #status = :status',
        ExpressionAttributeNames: {
            '#status': 'status',
        },
        ExpressionAttributeValues: {
            ':status': 'completed',
        },
    };

    try {
        await dynamodb.update(params).promise();
        requests.splice(index, 1);
        updateRequestTable();
        console.log(`Request ${request.RequestID} marked as completed.`);
    } catch (err) {
        console.error('Error marking request as completed:', err);
    }
}
