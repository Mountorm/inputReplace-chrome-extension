// 监听快捷键命令
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle_panel') {
    // 向当前活动标签页发送消息
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'togglePanel'});
      }
    });
  }
});

// 监听来自弹出窗口的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'enablePanelForTab') {
    // 从存储中获取当前启用面板的标签页列表
    chrome.storage.local.get({enabledTabs: []}, (result) => {
      const enabledTabs = result.enabledTabs || [];
      
      // 如果该标签页不在列表中，则添加
      if (!enabledTabs.includes(message.tabId)) {
        enabledTabs.push(message.tabId);
        chrome.storage.local.set({enabledTabs: enabledTabs});
      }
      
      sendResponse({success: true});
    });
    return true; // 保持消息通道开放，允许异步响应
  }
  
  if (message.action === 'disablePanelForTab') {
    // 从存储中获取当前启用面板的标签页列表
    chrome.storage.local.get({enabledTabs: []}, (result) => {
      let enabledTabs = result.enabledTabs || [];
      
      // 从列表中移除该标签页
      enabledTabs = enabledTabs.filter(tabId => tabId !== message.tabId);
      chrome.storage.local.set({enabledTabs: enabledTabs});
      
      sendResponse({success: true});
    });
    return true; // 保持消息通道开放，允许异步响应
  }
  
  if (message.action === 'isPanelEnabledForTab') {
    // 检查当前标签页是否启用了面板
    chrome.storage.local.get({enabledTabs: []}, (result) => {
      const enabledTabs = result.enabledTabs || [];
      sendResponse({enabled: enabledTabs.includes(message.tabId)});
    });
    return true; // 保持消息通道开放，允许异步响应
  }
}); 