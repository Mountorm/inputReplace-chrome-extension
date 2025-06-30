document.addEventListener('DOMContentLoaded', function() {
  const injectBtn = document.getElementById('injectBtn');
  const closeBtn = document.getElementById('closeBtn');
  const statusDiv = document.getElementById('status');

  // 检查当前标签页是否已启用面板
  checkPanelStatus();
  
  // 注入面板按钮点击事件
  injectBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const activeTab = tabs[0];
      
      // 向后台脚本发送消息，启用当前标签页的常驻面板
      chrome.runtime.sendMessage({
        action: 'enablePanelForTab',
        tabId: activeTab.id
      }, function(response) {
        if (response && response.success) {
          // 向内容脚本发送消息，显示常驻面板
          chrome.tabs.sendMessage(activeTab.id, {
            action: 'showPanel'
          }, function() {
            if (chrome.runtime.lastError) {
              showStatus('无法与页面通信，请刷新页面后重试', 'error');
              return;
            }
            
            showStatus('面板已注入页面', 'success');
            checkPanelStatus(); // 更新按钮状态
          });
        }
      });
    });
  });
  
  // 关闭面板按钮点击事件
  closeBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const activeTab = tabs[0];
      
      // 向内容脚本发送消息，关闭常驻面板
      chrome.tabs.sendMessage(activeTab.id, {
        action: 'closePanel'
      }, function() {
        if (chrome.runtime.lastError) {
          showStatus('无法与页面通信，请刷新页面后重试', 'error');
          return;
        }
        
        showStatus('面板已从页面移除', 'success');
        checkPanelStatus(); // 更新按钮状态
      });
    });
  });
  
  // 检查面板状态并更新按钮显示
  function checkPanelStatus() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const activeTab = tabs[0];
      
      // 向内容脚本发送消息，检查面板是否激活
      chrome.tabs.sendMessage(activeTab.id, {
        action: 'isPanelActive'
      }, function(response) {
        if (chrome.runtime.lastError) {
          // 如果出错，假设面板未激活
          injectBtn.style.display = 'block';
          closeBtn.style.display = 'none';
          return;
        }
        
        if (response && response.active) {
          // 如果面板已激活，显示关闭按钮
          injectBtn.style.display = 'none';
          closeBtn.style.display = 'block';
        } else {
          // 如果面板未激活，显示注入按钮
          injectBtn.style.display = 'block';
          closeBtn.style.display = 'none';
        }
      });
    });
  }
  
  // 显示状态消息
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    
    // 3秒后清除成功消息
    if (type === 'success') {
      setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = 'status';
      }, 3000);
    }
  }
}); 