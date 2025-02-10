// renderer.js
const { ipcRenderer } = require('electron');

function updateServerInfo() {
  ipcRenderer.invoke('get-history').then((history) => {
    if (history.length > 0) {
      const shareUrl = history[0].shareUrl;
      // Extract base URL from the share URL.
      const baseUrl = shareUrl.substring(0, shareUrl.lastIndexOf('/share/'));
      document.getElementById('server-info').innerText = `Server running at: ${baseUrl}`;
    } else {
      document.getElementById('server-info').innerText = `Server running at: http://localhost:${5000}`;
    }
  });
}

function loadHistory() {
  ipcRenderer.invoke('get-history').then((history) => {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';
    history.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      
      const details = document.createElement('div');
      details.className = 'history-details';
      details.innerHTML = `<strong>${item.fileName}</strong><br>
                           <a class="link" data-link="${item.shareUrl}">${item.shareUrl}</a>`;
      div.appendChild(details);
      
      const actions = document.createElement('div');
      actions.className = 'history-actions';
      
      const openBtn = document.createElement('button');
      openBtn.innerText = 'Open';
      openBtn.onclick = () => { ipcRenderer.invoke('open-link', item.shareUrl); };
      
      const copyBtn = document.createElement('button');
      copyBtn.innerText = 'Copy';
      copyBtn.onclick = () => { ipcRenderer.invoke('copy-link', item.shareUrl); };
      
      const delBtn = document.createElement('button');
      delBtn.innerText = 'Delete';
      delBtn.onclick = () => { ipcRenderer.invoke('delete-share', item.shareId).then(loadHistory); };
      
      actions.appendChild(openBtn);
      actions.appendChild(copyBtn);
      actions.appendChild(delBtn);
      
      div.appendChild(actions);
      historyList.appendChild(div);
    });
    updateServerInfo();
  });
}

document.getElementById('shareBtn').addEventListener('click', () => {
  ipcRenderer.invoke('share-file').then(result => {
    if (result) {
      alert(`File shared! URL: ${result.shareUrl}`);
      loadHistory();
    }
  }).catch(err => {
    alert('Error sharing file: ' + err);
  });
});

document.getElementById('refreshBtn').addEventListener('click', loadHistory);
document.getElementById('exitBtn').addEventListener('click', () => {
  window.close();
});

// Load history on startup.
loadHistory();
