// Глобальный AI-помощник для клиентов (GigaChat)
(function() {
    // Проверяем, что пользователь авторизован и имеет роль client
    const user = (function() {
        try {
            const u = localStorage.getItem('user');
            return u ? JSON.parse(u) : null;
        } catch(e) { return null; }
    })();
    if (!user || user.role !== 'client') return;

    let chatHistory = [];
    let isOpen = false;

    // Функция добавления сообщения в окно чата
    function addMessage(text, isUser) {
        const container = document.getElementById('aiAssistantMessages');
        if (!container) return;
        const messageDiv = document.createElement('div');
        messageDiv.style.margin = '8px 0';
        messageDiv.style.padding = '8px 12px';
        messageDiv.style.borderRadius = '18px';
        messageDiv.style.maxWidth = '80%';
        messageDiv.style.wordWrap = 'break-word';
        if (isUser) {
            messageDiv.style.backgroundColor = '#1a6d5e';
            messageDiv.style.color = 'white';
            messageDiv.style.marginLeft = 'auto';
            messageDiv.style.textAlign = 'right';
        } else {
            messageDiv.style.backgroundColor = '#e8f4f0';
            messageDiv.style.color = '#1a3c4a';
        }
        messageDiv.innerText = text;
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    }

    // Отправка сообщения на сервер
    async function sendMessage(message) {
        const input = document.getElementById('aiAssistantInput');
        const sendBtn = document.getElementById('aiAssistantSend');
        if (!message.trim()) return;
        input.value = '';
        addMessage(message, true);
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
        try {
            const response = await fetch('/api/client/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
                body: JSON.stringify({ message, history: chatHistory })
            });
            const data = await response.json();
            if (data.success) {
                addMessage(data.answer, false);
                chatHistory.push({ role: 'user', content: message });
                chatHistory.push({ role: 'assistant', content: data.answer });
                // сохраняем последние 20 сообщений
                localStorage.setItem('ai_chat_history', JSON.stringify(chatHistory.slice(-20)));
            } else {
                addMessage('❌ Ошибка: ' + (data.error || 'Неизвестная ошибка'), false);
            }
        } catch (err) {
            addMessage('❌ Не удалось связаться с помощником. Попробуйте позже.', false);
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }

    // Загрузка истории из localStorage
    function loadHistoryFromStorage() {
        const saved = localStorage.getItem('ai_chat_history');
        if (saved) {
            try {
                chatHistory = JSON.parse(saved);
                for (const msg of chatHistory) {
                    if (msg.role === 'user') addMessage(msg.content, true);
                    else if (msg.role === 'assistant') addMessage(msg.content, false);
                }
            } catch(e) { console.warn(e); }
        } else {
            addMessage('👋 Здравствуйте! Я ваш цифровой помощник. Задайте вопрос о процедурах, симптомах или подготовке к визиту.', false);
        }
    }

    // Открыть/закрыть чат
    function toggleChat(open) {
        const chatDiv = document.getElementById('aiAssistantChat');
        if (!chatDiv) return;
        if (open === undefined) isOpen = !isOpen;
        else isOpen = open;
        chatDiv.style.display = isOpen ? 'flex' : 'none';
        if (isOpen && document.getElementById('aiAssistantMessages').children.length === 0) {
            loadHistoryFromStorage();
        }
    }

    // Создание HTML виджета
    function createWidget() {
        const widgetHTML = `
            <div id="aiAssistantWidget" style="position: fixed; bottom: 20px; right: 20px; z-index: 10000; font-family: 'Inter', sans-serif;">
                <div id="aiAssistantButton" style="background-color: #1a6d5e; width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: transform 0.2s;">
                    <i class="fas fa-robot" style="color: white; font-size: 28px;"></i>
                </div>
                <div id="aiAssistantChat" style="display: none; position: absolute; bottom: 70px; right: 0; width: 350px; max-width: calc(100vw - 40px); background: white; border-radius: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); overflow: hidden; border: 1px solid #e2e8f0; flex-direction: column;">
                    <div style="background: #1a6d5e; color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
                        <span><i class="fas fa-robot"></i> Медицинский помощник</span>
                        <span id="aiAssistantClose" style="cursor: pointer;"><i class="fas fa-times"></i></span>
                    </div>
                    <div id="aiAssistantMessages" style="height: 300px; overflow-y: auto; padding: 12px; background: #f9fafc; display: flex; flex-direction: column;"></div>
                    <div style="padding: 12px; border-top: 1px solid #e2e8f0; display: flex; gap: 8px;">
                        <input type="text" id="aiAssistantInput" placeholder="Задайте вопрос..." style="flex: 1; margin: 0; padding: 8px 12px; border-radius: 40px; border: 1px solid #ddd;">
                        <button id="aiAssistantSend" style="margin: 0; padding: 8px 16px; border-radius: 40px;"><i class="fas fa-paper-plane"></i></button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', widgetHTML);
    }

    function init() {
        createWidget();
        const button = document.getElementById('aiAssistantButton');
        const closeBtn = document.getElementById('aiAssistantClose');
        const sendBtn = document.getElementById('aiAssistantSend');
        const input = document.getElementById('aiAssistantInput');

        button.addEventListener('click', () => toggleChat(true));
        closeBtn.addEventListener('click', () => toggleChat(false));
        sendBtn.addEventListener('click', () => sendMessage(input.value));
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage(input.value);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();