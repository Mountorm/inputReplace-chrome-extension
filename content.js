// 全局变量存储搜索结果
let searchResults = [];
let highlightedElements = [];
let panelVisible = false;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let panel = null;
let toggleButton = null;
let panelContainer = null;
let isPanelEnabled = false; // 标记面板是否已启用

// 监听来自弹出界面的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'replaceText') {
    const result = replaceInputValues(request.searchText, request.replaceText);
    sendResponse(result);
  } else if (request.action === 'searchText') {
    const result = searchInputValues(request.searchText);
    sendResponse(result);
  } else if (request.action === 'goToMatch') {
    goToMatch(request.index);
    sendResponse({success: true});
  } else if (request.action === 'clearHighlights') {
    clearHighlights();
    sendResponse({success: true});
  } else if (request.action === 'replaceCurrentMatch') {
    const result = replaceCurrentMatch(request.searchText, request.replaceText, request.index);
    sendResponse(result);
  } else if (request.action === 'showPanel') {
    initPanel();
    showPanel();
    isPanelEnabled = true;
    sendResponse({success: true});
  } else if (request.action === 'togglePanel') {
    if (panel && isPanelEnabled) {
      togglePanelVisibility();
      sendResponse({success: true});
    } else if (isPanelEnabled) {
      initPanel();
      showPanel();
      sendResponse({success: true});
    } else {
      sendResponse({success: false, message: '面板未启用'});
    }
  } else if (request.action === 'closePanel') {
    closePanel();
    sendResponse({success: true});
  } else if (request.action === 'isPanelActive') {
    sendResponse({active: isPanelEnabled});
  }
  return true; // 保持消息通道开放，允许异步响应
});

// 页面加载完成后检查是否需要显示面板
window.addEventListener('load', function() {
  // 获取当前标签页ID
  chrome.runtime.sendMessage({action: 'isPanelEnabledForTab', tabId: getTabId()}, function(response) {
    if (response && response.enabled) {
      isPanelEnabled = true;
      initPanel();
    }
  });
});

/**
 * 获取当前标签页ID
 */
function getTabId() {
  // 由于内容脚本无法直接获取标签页ID，我们使用URL作为标识符
  return window.location.href;
}

/**
 * 创建面板容器，确保面板始终在最上层
 */
function createPanelContainer() {
  // 如果容器已经存在，则不重复创建
  if (panelContainer) return panelContainer;
  
  // 创建一个新的容器元素
  panelContainer = document.createElement('div');
  panelContainer.style.position = 'fixed';
  panelContainer.style.top = '0';
  panelContainer.style.left = '0';
  panelContainer.style.width = '0';
  panelContainer.style.height = '0';
  panelContainer.style.zIndex = '2147483647'; // 最大可能的z-index值
  panelContainer.style.pointerEvents = 'none'; // 不阻挡鼠标事件
  
  // 将容器添加到文档的最外层
  document.documentElement.appendChild(panelContainer);
  
  return panelContainer;
}

/**
 * 创建并初始化常驻面板
 */
function initPanel() {
  // 如果面板已经存在，则不重复创建
  if (panel) return;
  
  // 确保面板容器存在
  const container = createPanelContainer();
  
  // 创建面板容器
  panel = document.createElement('div');
  panel.className = 'replace-panel hidden';
  panel.style.pointerEvents = 'auto'; // 允许面板接收鼠标事件
  
  // 创建面板头部
  const header = document.createElement('div');
  header.className = 'replace-panel-header';
  
  const title = document.createElement('h3');
  title.className = 'replace-panel-title';
  title.textContent = '批量替换输入框文本';
  
  const controls = document.createElement('div');
  controls.className = 'replace-panel-controls';
  
  const minimizeBtn = document.createElement('button');
  minimizeBtn.className = 'replace-panel-control';
  minimizeBtn.title = '最小化';
  minimizeBtn.addEventListener('click', hidePanelAndShowToggle);
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'replace-panel-control';
  closeBtn.title = '关闭';
  closeBtn.addEventListener('click', closePanel);
  
  // 使用SVG作为图标
  minimizeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 7H11.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.5 2.5L2.5 11.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 2.5L11.5 11.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  
  controls.appendChild(minimizeBtn);
  controls.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(controls);
  
  // 添加拖动功能
  header.addEventListener('mousedown', function(e) {
    if (e.target === header || e.target === title) {
      isDragging = true;
      dragOffsetX = e.clientX - panel.getBoundingClientRect().left;
      dragOffsetY = e.clientY - panel.getBoundingClientRect().top;
    }
  });
  
  // 创建面板内容
  const content = document.createElement('div');
  content.className = 'replace-panel-content';
  
  // 新增：提取内容输入框和按钮
  const extractGroup = document.createElement('div');
  extractGroup.className = 'replace-panel-form-group';

  const extractLabel = document.createElement('label');
  extractLabel.className = 'replace-panel-label';
  extractLabel.textContent = '商品标题：';

  const extractInput = document.createElement('input');
  extractInput.type = 'text';
  extractInput.className = 'replace-panel-input';
  extractInput.setAttribute('readonly', 'readonly');
  extractInput.placeholder = '点击提取按钮获取内容';

  const extractBtn = document.createElement('button');
  extractBtn.className = 'replace-panel-button';
  extractBtn.textContent = '提取';
  extractBtn.style.marginLeft = '8px';

  extractBtn.addEventListener('click', function() {
    // 新的查找逻辑：查找class为chat-gpt-panel is-title的元素下的第一个input
    const panel = document.querySelector('.chat-gpt-panel.is-title');
    let foundInput = null;
    if (panel) {
      const inputs = panel.querySelectorAll('input');
      if (inputs.length > 0) {
        foundInput = inputs[0];
      }
    }
    if (foundInput) {
      extractInput.value = foundInput.value;
      showPanelStatus('提取成功', 'success', status);
    } else {
      extractInput.value = '';
      showPanelStatus('未找到目标input', 'error', status);
    }
  });

  extractGroup.appendChild(extractLabel);
  extractGroup.appendChild(extractInput);
  extractGroup.appendChild(extractBtn);

  // 搜索关键词输入框
  const searchGroup = document.createElement('div');
  searchGroup.className = 'replace-panel-form-group';
  
  const searchLabel = document.createElement('label');
  searchLabel.className = 'replace-panel-label';
  searchLabel.textContent = '搜索关键词：';
  
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'replace-panel-input';
  searchInput.setAttribute('data-panel-element', 'true'); // 标记为面板元素
  searchInput.placeholder = '输入要查找的文本';
  
  searchGroup.appendChild(searchLabel);
  searchGroup.appendChild(searchInput);
  
  // 替换内容输入框
  const replaceGroup = document.createElement('div');
  replaceGroup.className = 'replace-panel-form-group';
  
  const replaceLabel = document.createElement('label');
  replaceLabel.className = 'replace-panel-label';
  replaceLabel.textContent = '替换内容：';
  
  const replaceInput = document.createElement('input');
  replaceInput.type = 'text';
  replaceInput.className = 'replace-panel-input';
  replaceInput.setAttribute('data-panel-element', 'true'); // 标记为面板元素
  replaceInput.placeholder = '输入要替换的文本';
  
  replaceGroup.appendChild(replaceLabel);
  replaceGroup.appendChild(replaceInput);
  
  // 第一行按钮组（搜索和下一个）
  const buttonGroup1 = document.createElement('div');
  buttonGroup1.className = 'replace-panel-button-group';
  
  const searchBtn = document.createElement('button');
  searchBtn.className = 'replace-panel-button replace-panel-search-btn';
  searchBtn.textContent = '搜索';
  
  const nextBtn = document.createElement('button');
  nextBtn.className = 'replace-panel-button replace-panel-next-btn';
  nextBtn.textContent = '下一个';
  nextBtn.disabled = true;
  
  buttonGroup1.appendChild(searchBtn);
  buttonGroup1.appendChild(nextBtn);
  
  // 第二行按钮组（替换当前和替换所有）
  const buttonGroup2 = document.createElement('div');
  buttonGroup2.className = 'replace-panel-button-group';
  
  const replaceOneBtn = document.createElement('button');
  replaceOneBtn.className = 'replace-panel-button replace-panel-replace-one-btn';
  replaceOneBtn.textContent = '替换当前';
  replaceOneBtn.disabled = true;
  
  const replaceAllBtn = document.createElement('button');
  replaceAllBtn.className = 'replace-panel-button';
  replaceAllBtn.textContent = '替换所有';
  
  buttonGroup2.appendChild(replaceOneBtn);
  buttonGroup2.appendChild(replaceAllBtn);
  
  // 搜索信息显示
  const searchInfo = document.createElement('div');
  searchInfo.className = 'replace-panel-search-info';
  
  const searchCount = document.createElement('span');
  searchCount.className = 'replace-panel-search-count';
  
  const currentMatch = document.createElement('span');
  currentMatch.className = 'replace-panel-current-match';
  
  searchInfo.appendChild(searchCount);
  searchInfo.appendChild(currentMatch);
  
  // 状态信息
  const status = document.createElement('div');
  status.className = 'replace-panel-status';
  
  // 组装面板内容（插入到最上方）
  content.appendChild(extractGroup);
  content.appendChild(searchGroup);
  content.appendChild(replaceGroup);
  content.appendChild(buttonGroup1);
  content.appendChild(buttonGroup2);
  content.appendChild(searchInfo);
  content.appendChild(status);
  
  // 组装面板
  panel.appendChild(header);
  panel.appendChild(content);
  
  // 创建切换按钮
  toggleButton = document.createElement('div');
  toggleButton.className = 'replace-panel-toggle';
  toggleButton.title = '显示替换面板';
  toggleButton.style.pointerEvents = 'auto'; // 允许按钮接收鼠标事件
  
  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'replace-panel-toggle-icon';
  toggleIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 10L4 6L8 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 6H16C18.2091 6 20 7.79086 20 10V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 14L20 18L16 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 18H8C5.79086 18 4 16.2091 4 14V14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  
  toggleButton.appendChild(toggleIcon);
  toggleButton.addEventListener('click', showPanel);
  
  // 添加到面板容器
  container.appendChild(panel);
  container.appendChild(toggleButton);
  
  // 添加事件监听
  searchInput.addEventListener('input', function() {
    resetSearchState(searchCount, currentMatch, nextBtn, replaceOneBtn, status);
  });
  
  searchBtn.addEventListener('click', function() {
    const searchText = searchInput.value.trim();
    
    if (!searchText) {
      showPanelStatus('请输入要查找的文本', 'error', status);
      return;
    }
    
    resetSearchState(searchCount, currentMatch, nextBtn, replaceOneBtn, status);
    const result = searchInputValues(searchText);
    
    if (result.success) {
      if (result.count > 0) {
        nextBtn.disabled = result.count <= 1;
        replaceOneBtn.disabled = false;
        searchCount.textContent = `共找到 ${result.count} 个匹配`;
        currentMatch.textContent = `当前: 1/${result.count}`;
      } else {
        searchCount.textContent = '未找到匹配项';
        currentMatch.textContent = '';
        showPanelStatus('未找到匹配的文本', 'error', status);
      }
    } else {
      showPanelStatus(result.message || '搜索操作失败', 'error', status);
    }
  });
  
  nextBtn.addEventListener('click', function() {
    if (searchResults.length <= 0) return;
    
    let currentIndex = getCurrentIndex();
    currentIndex = (currentIndex + 1) % searchResults.length;
    
    goToMatch(currentIndex);
    currentMatch.textContent = `当前: ${currentIndex + 1}/${searchResults.length}`;
  });
  
  replaceOneBtn.addEventListener('click', function() {
    const searchText = searchInput.value.trim();
    const replaceText = replaceInput.value;
    
    if (!searchText) {
      showPanelStatus('请输入要查找的文本', 'error', status);
      return;
    }
    
    const currentIndex = getCurrentIndex();
    const result = replaceCurrentMatch(searchText, replaceText, currentIndex);
    
    if (result.success) {
      showPanelStatus(`已替换当前匹配项`, 'success', status);
      
      // 更新搜索结果
      if (searchResults.length > 0) {
        // 重新搜索以更新结果
        searchInputValues(searchText);
        
        if (searchResults.length > 0) {
          // 如果还有结果，更新显示
          nextBtn.disabled = searchResults.length <= 1;
          replaceOneBtn.disabled = false;
          searchCount.textContent = `共找到 ${searchResults.length} 个匹配`;
          
          // 如果当前索引超出范围，重置为0
          let newIndex = Math.min(currentIndex, searchResults.length - 1);
          goToMatch(newIndex);
          currentMatch.textContent = `当前: ${newIndex + 1}/${searchResults.length}`;
        } else {
          // 如果没有结果了，重置状态
          resetSearchState(searchCount, currentMatch, nextBtn, replaceOneBtn, status);
          searchCount.textContent = '未找到匹配项';
        }
      }
    } else {
      showPanelStatus(result.message || '替换操作失败', 'error', status);
    }
  });
  
  replaceAllBtn.addEventListener('click', function() {
    const searchText = searchInput.value.trim();
    const replaceText = replaceInput.value;
    
    if (!searchText) {
      showPanelStatus('请输入要查找的文本', 'error', status);
      return;
    }
    
    const result = replaceInputValues(searchText, replaceText);
    
    if (result.success) {
      showPanelStatus(`替换完成！共替换了 ${result.count} 处文本。`, 'success', status);
      resetSearchState(searchCount, currentMatch, nextBtn, replaceOneBtn, status);
    } else {
      showPanelStatus(result.message || '替换操作失败', 'error', status);
    }
  });
  
  // 添加拖动事件监听
  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    
    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    
    // 确保面板不会被拖出视口
    const maxX = window.innerWidth - panel.offsetWidth;
    const maxY = window.innerHeight - panel.offsetHeight;
    
    panel.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    panel.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
  });
  
  document.addEventListener('mouseup', function() {
    isDragging = false;
  });
  
  // 设置初始位置
  panel.style.top = '20px';
  panel.style.right = '20px';
}

/**
 * 关闭面板并从页面中移除
 */
function closePanel() {
  // 从存储中移除当前标签页
  chrome.runtime.sendMessage({
    action: 'disablePanelForTab',
    tabId: getTabId()
  });
  
  // 移除面板和按钮
  if (panel) {
    panel.remove();
    panel = null;
  }
  
  if (toggleButton) {
    toggleButton.remove();
    toggleButton = null;
  }
  
  // 重置状态
  isPanelEnabled = false;
  panelVisible = false;
  clearHighlights();
  searchResults = [];
}

/**
 * 显示面板状态信息
 */
function showPanelStatus(message, type, statusElement) {
  statusElement.textContent = message;
  statusElement.className = 'replace-panel-status';
  
  if (type === 'error') {
    statusElement.classList.add('replace-panel-error');
  } else if (type === 'success') {
    statusElement.classList.add('replace-panel-success');
    
    // 3秒后清除成功消息
    setTimeout(() => {
      statusElement.textContent = '';
      statusElement.className = 'replace-panel-status';
    }, 3000);
  }
}

/**
 * 重置面板搜索状态
 */
function resetSearchState(searchCountElement, currentMatchElement, nextBtnElement, replaceOneBtnElement, statusElement) {
  clearHighlights();
  searchResults = [];
  
  nextBtnElement.disabled = true;
  replaceOneBtnElement.disabled = true;
  searchCountElement.textContent = '';
  currentMatchElement.textContent = '';
  statusElement.textContent = '';
  statusElement.className = 'replace-panel-status';
}

/**
 * 获取当前匹配项索引
 */
function getCurrentIndex() {
  if (searchResults.length === 0) return -1;
  
  // 查找当前高亮的元素
  for (let i = 0; i < searchResults.length; i++) {
    const element = searchResults[i].element;
    if (highlightedElements.includes(element)) {
      return i;
    }
  }
  
  return 0; // 默认返回第一个
}

/**
 * 显示面板
 */
function showPanel() {
  if (!panel) return;
  
  panel.classList.remove('hidden');
  toggleButton.style.display = 'none';
  panelVisible = true;
  
  // 确保面板在视口内
  ensurePanelInViewport();
}

/**
 * 隐藏面板并显示切换按钮
 */
function hidePanelAndShowToggle() {
  if (!panel) return;
  
  // 清除所有高亮
  clearHighlights();
  
  panel.classList.add('hidden');
  toggleButton.style.display = 'flex';
  panelVisible = false;
}

/**
 * 切换面板可见性
 */
function togglePanelVisibility() {
  if (panelVisible) {
    hidePanelAndShowToggle();
  } else {
    showPanel();
  }
}

/**
 * 确保面板在视口内
 */
function ensurePanelInViewport() {
  if (!panel) return;
  
  // 获取面板当前位置和尺寸
  const rect = panel.getBoundingClientRect();
  
  // 获取视口尺寸
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // 检查面板是否超出视口
  let newX = rect.left;
  let newY = rect.top;
  
  // 如果面板右侧超出视口
  if (rect.right > viewportWidth) {
    newX = Math.max(0, viewportWidth - rect.width - 20);
  }
  
  // 如果面板左侧超出视口
  if (rect.left < 0) {
    newX = 20;
  }
  
  // 如果面板底部超出视口
  if (rect.bottom > viewportHeight) {
    newY = Math.max(0, viewportHeight - rect.height - 20);
  }
  
  // 如果面板顶部超出视口
  if (rect.top < 0) {
    newY = 20;
  }
  
  // 更新面板位置
  panel.style.left = newX + 'px';
  panel.style.top = newY + 'px';
}

/**
 * 在所有输入框和文本区域中搜索文本
 * @param {string} searchText - 要查找的文本
 * @returns {object} - 搜索操作的结果
 */
function searchInputValues(searchText) {
  try {
    // 清除之前的高亮
    clearHighlights();
    
    // 重置搜索结果
    searchResults = [];
    
    // 获取所有文本输入框和文本区域
    const textInputs = document.querySelectorAll('input[type="text"], input:not([type]), textarea');
    
    // 遍历所有输入元素
    textInputs.forEach(input => {
      // 跳过禁用或只读的输入框
      if (input.disabled || input.readOnly) {
        return;
      }
      
      // 跳过工具本身的输入框（检查是否在我们的面板内）
      if (isElementInPanel(input)) {
        return;
      }
      
      const currentValue = input.value;
      
      // 如果输入框包含要搜索的文本，则添加到结果中
      if (currentValue.includes(searchText)) {
        searchResults.push({
          element: input,
          value: currentValue,
          searchText: searchText
        });
      }
    });
    
    // 如果有搜索结果，高亮第一个并滚动到该位置
    if (searchResults.length > 0) {
      highlightAndScrollToMatch(0);
    }
    
    return {
      success: true,
      count: searchResults.length,
      message: `找到 ${searchResults.length} 个匹配项`
    };
  } catch (error) {
    console.error('搜索文本时出错：', error);
    return {
      success: false,
      message: `搜索失败: ${error.message}`
    };
  }
}

/**
 * 替换当前匹配项
 * @param {string} searchText - 要查找的文本
 * @param {string} replaceText - 要替换的文本
 * @param {number} index - 匹配项索引
 * @returns {object} - 替换操作的结果
 */
function replaceCurrentMatch(searchText, replaceText, index) {
  try {
    if (index < 0 || index >= searchResults.length) {
      return {
        success: false,
        message: '无效的匹配项索引'
      };
    }
    
    const match = searchResults[index];
    const element = match.element;
    
    // 跳过禁用或只读的输入框
    if (element.disabled || element.readOnly) {
      return {
        success: false,
        message: '无法替换只读或禁用的输入框'
      };
    }
    
    // 跳过工具本身的输入框（虽然这些框不应该出现在searchResults中，但仍作检查）
    if (isElementInPanel(element)) {
      return {
        success: false,
        message: '无法替换工具自身的输入框'
      };
    }
    
    const currentValue = element.value;
    
    // 使用正则表达式进行全局替换（但只替换第一个匹配项）
    const regex = new RegExp(escapeRegExp(searchText));
    const newValue = currentValue.replace(regex, replaceText);
    
    // 设置新值并触发 input 和 change 事件
    element.value = newValue;
    triggerInputEvent(element);
    
    return {
      success: true,
      message: '替换成功'
    };
  } catch (error) {
    console.error('替换文本时出错：', error);
    return {
      success: false,
      message: `替换失败: ${error.message}`
    };
  }
}

/**
 * 清除所有高亮
 */
function clearHighlights() {
  // 恢复所有高亮元素的原始样式
  highlightedElements.forEach(element => {
    element.style.backgroundColor = element.dataset.originalBackground || '';
    element.style.boxShadow = element.dataset.originalBoxShadow || '';
    delete element.dataset.originalBackground;
    delete element.dataset.originalBoxShadow;
  });
  
  // 清空高亮元素数组
  highlightedElements = [];
}

/**
 * 高亮并滚动到指定索引的匹配项
 * @param {number} index - 匹配项索引
 */
function highlightAndScrollToMatch(index) {
  if (index < 0 || index >= searchResults.length) return;
  
  // 清除之前的高亮
  clearHighlights();
  
  const match = searchResults[index];
  const element = match.element;
  
  // 保存原始样式
  element.dataset.originalBackground = element.style.backgroundColor;
  element.dataset.originalBoxShadow = element.style.boxShadow;
  
  // 应用高亮样式
  element.style.backgroundColor = '#ffeb3b'; // 黄色高亮
  element.style.boxShadow = '0 0 8px 2px rgba(255, 193, 7, 0.8)'; // 发光效果
  
  // 添加到高亮元素数组
  highlightedElements.push(element);
  
  // 滚动到元素位置
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
  
  // 聚焦元素但不改变其内容
  const selStart = element.selectionStart;
  const selEnd = element.selectionEnd;
  element.focus();
  
  // 尝试选中匹配的文本
  try {
    const value = element.value;
    const searchText = match.searchText;
    let startPos = value.indexOf(searchText);
    
    if (startPos >= 0) {
      element.setSelectionRange(startPos, startPos + searchText.length);
    } else {
      // 如果无法选中，恢复原来的选择范围
      element.setSelectionRange(selStart, selEnd);
    }
  } catch (e) {
    console.error('无法设置选择范围', e);
  }
}

/**
 * 跳转到指定索引的匹配项
 * @param {number} index - 匹配项索引
 */
function goToMatch(index) {
  highlightAndScrollToMatch(index);
}

/**
 * 在所有输入框和文本区域中替换文本
 * @param {string} searchText - 要查找的文本
 * @param {string} replaceText - 要替换的文本
 * @returns {object} - 替换操作的结果
 */
function replaceInputValues(searchText, replaceText) {
  try {
    // 获取所有文本输入框和文本区域
    const textInputs = document.querySelectorAll('input[type="text"], input:not([type]), textarea');
    let count = 0;
    
    // 遍历所有输入元素
    textInputs.forEach(input => {
      // 跳过禁用或只读的输入框
      if (input.disabled || input.readOnly) {
        return;
      }
      
      // 跳过工具本身的输入框
      if (isElementInPanel(input)) {
        return;
      }
      
      const currentValue = input.value;
      
      // 如果输入框包含要搜索的文本，则进行替换
      if (currentValue.includes(searchText)) {
        // 使用正则表达式进行全局替换
        const regex = new RegExp(escapeRegExp(searchText), 'g');
        const newValue = currentValue.replace(regex, replaceText);
        
        // 设置新值并触发 input 和 change 事件
        input.value = newValue;
        triggerInputEvent(input);
        
        count++;
      }
    });
    
    // 清除所有高亮和搜索结果
    clearHighlights();
    searchResults = [];
    
    return {
      success: true,
      count: count,
      message: `替换完成，共处理 ${count} 个输入框`
    };
  } catch (error) {
    console.error('替换文本时出错：', error);
    return {
      success: false,
      message: `替换失败: ${error.message}`
    };
  }
}

/**
 * 转义正则表达式中的特殊字符
 * @param {string} string - 要转义的字符串
 * @returns {string} - 转义后的字符串
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 为输入元素触发事件
 * @param {HTMLElement} element - 要触发事件的元素
 */
function triggerInputEvent(element) {
  // 创建并分发 input 事件
  const inputEvent = new Event('input', { bubbles: true });
  element.dispatchEvent(inputEvent);
  
  // 创建并分发 change 事件
  const changeEvent = new Event('change', { bubbles: true });
  element.dispatchEvent(changeEvent);
}

/**
 * 检查元素是否在我们的面板内
 * @param {HTMLElement} element - 要检查的元素
 * @returns {boolean} - 如果元素在面板内则返回true
 */
function isElementInPanel(element) {
  // 检查元素自身是否有data-panel-element属性
  if (element.getAttribute && element.getAttribute('data-panel-element') === 'true') {
    return true;
  }
  
  // 检查元素是否有replace-panel类名的祖先元素
  let parent = element;
  while (parent) {
    if (parent.classList && (
        parent.classList.contains('replace-panel') || 
        parent.classList.contains('replace-panel-toggle'))) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

// 添加窗口大小变化监听
window.addEventListener('resize', function() {
  if (panel && panelVisible) {
    ensurePanelInViewport();
  }
});

// 监听页面滚动事件，确保面板始终可见
window.addEventListener('scroll', function() {
  if (panel && panelVisible) {
    ensurePanelInViewport();
  }
}, { passive: true }); 