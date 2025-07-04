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

// API相关参数
let apiSettings = {
  apiKey: 'sk-eae202e23b094000a09a116ddf898df6',
  model: 'deepseek-chat',
  temperature: 1.2,
  max_tokens: 5000
};

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
  panelContainer.style.zIndex = '2147483640'; // 降低z-index值
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
  title.textContent = '上货助手';
  
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
  
  // 创建标签栏
  const tabs = document.createElement('div');
  tabs.className = 'panel-tabs';
  
  // 创建两个标签
  const titleTab = document.createElement('div');
  titleTab.className = 'panel-tab active'; // 默认激活标题优化标签
  titleTab.textContent = '标题优化';
  titleTab.dataset.tab = 'title';
  
  const skuTab = document.createElement('div');
  skuTab.className = 'panel-tab';
  skuTab.textContent = 'SKU优化';
  skuTab.dataset.tab = 'sku';
  
  const otherTab = document.createElement('div');
  otherTab.className = 'panel-tab';
  otherTab.textContent = '其他内容';
  otherTab.dataset.tab = 'other';
  
  tabs.appendChild(titleTab);
  tabs.appendChild(skuTab);
  tabs.appendChild(otherTab);
  
  // 添加标签切换事件
  [titleTab, skuTab, otherTab].forEach(tab => {
    tab.addEventListener('click', function() {
      // 移除所有标签和内容的活动状态
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      // 激活当前标签
      this.classList.add('active');
      
      // 激活对应的内容
      const tabName = this.dataset.tab;
      const activeContent = document.querySelector(`.tab-content[data-tab="${tabName}"]`);
      if (activeContent) {
        activeContent.classList.add('active');
      }
    });
  });
  
  content.appendChild(tabs);
  
  // 创建标签内容容器
  
  // 标题优化标签内容
  const titleContent = document.createElement('div');
  titleContent.className = 'tab-content active'; // 默认激活
  titleContent.dataset.tab = 'title';
  
  // 添加设置按钮
  const settingsContainer = document.createElement('div');
  settingsContainer.className = 'title-settings-container';
  
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'title-settings-button';
  settingsBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 10C9.10457 10 10 9.10457 10 8C10 6.89543 9.10457 6 8 6C6.89543 6 6 6.89543 6 8C6 9.10457 6.89543 10 8 10Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12.9333 9.83333C12.8 10.2667 12.9333 10.7333 13.2667 11.0333L13.3 11.0667C13.5759 11.3425 13.7302 11.7151 13.7302 12.1C13.7302 12.4849 13.5759 12.8575 13.3 13.1333C13.0242 13.4092 12.6516 13.5635 12.2667 13.5635C11.8818 13.5635 11.5092 13.4092 11.2333 13.1333L11.2 13.1C10.9 12.7667 10.4333 12.6333 10 12.7667C9.56667 12.8667 9.26667 13.2333 9.26667 13.6667V13.8333C9.26667 14.6333 8.6 15.3 7.8 15.3H7.53333C6.73333 15.3 6.06667 14.6333 6.06667 13.8333V13.7667C6.05 13.3 5.73333 12.9333 5.3 12.8333C4.86667 12.7 4.4 12.8333 4.1 13.1667L4.06667 13.2C3.79084 13.4759 3.41823 13.6302 3.03333 13.6302C2.64844 13.6302 2.27583 13.4759 2 13.2C1.72409 12.9242 1.56979 12.5516 1.56979 12.1667C1.56979 11.7818 1.72409 11.4092 2 11.1333L2.03333 11.1C2.36667 10.8 2.5 10.3333 2.36667 9.9C2.26667 9.46667 1.9 9.16667 1.46667 9.16667H1.3C0.5 9.16667 0 8.5 0 7.7V7.43333C0 6.63333 0.666667 5.96667 1.46667 5.96667H1.53333C1.96667 5.95 2.36667 5.63333 2.46667 5.2C2.6 4.76667 2.46667 4.3 2.13333 4L2.1 3.96667C1.82409 3.69084 1.66979 3.31823 1.66979 2.93333C1.66979 2.54844 1.82409 2.17583 2.1 1.9C2.37583 1.62409 2.74844 1.46979 3.13333 1.46979C3.51823 1.46979 3.89084 1.62409 4.16667 1.9L4.2 1.93333C4.5 2.26667 4.96667 2.4 5.4 2.26667H5.46667C5.9 2.16667 6.2 1.8 6.2 1.36667V1.3C6.2 0.5 6.86667 0 7.66667 0H7.93333C8.73333 0 9.4 0.666667 9.4 1.46667V1.53333C9.4 1.96667 9.7 2.36667 10.1333 2.46667C10.5667 2.6 11.0333 2.46667 11.3333 2.13333L11.3667 2.1C11.6425 1.82409 12.0151 1.66979 12.4 1.66979C12.7849 1.66979 13.1575 1.82409 13.4333 2.1C13.7092 2.37583 13.8635 2.74844 13.8635 3.13333C13.8635 3.51823 13.7092 3.89084 13.4333 4.16667L13.4 4.2C13.0667 4.5 12.9333 4.96667 13.0667 5.4V5.46667C13.1667 5.9 13.5333 6.2 13.9667 6.2H14.0333C14.8333 6.2 15.5 6.86667 15.5 7.66667V7.93333C15.5 8.73333 14.8333 9.4 14.0333 9.4H13.9667C13.5667 9.4 13.1667 9.7 13.0667 10.1333V10.1667L12.9333 9.83333Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  settingsBtn.title = "设置API参数";
  settingsBtn.addEventListener('click', showSettingsModal);
  
  settingsContainer.appendChild(settingsBtn);
  titleContent.appendChild(settingsContainer);
  
  // 添加标题提取功能
  const extractGroup = document.createElement('div');
  extractGroup.className = 'replace-panel-form-group';

  const extractLabel = document.createElement('label');
  extractLabel.className = 'replace-panel-label';
  extractLabel.textContent = '商品标题：';

  const extractInput = document.createElement('input');
  extractInput.type = 'text';
  extractInput.className = 'replace-panel-input';
  // 移除readonly属性，使其可编辑
  extractInput.placeholder = '点击提取按钮获取内容或直接输入';
  
  // 创建按钮容器
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'title-button-container';

  // 放大提取按钮
  const extractBtn = document.createElement('button');
  extractBtn.className = 'replace-panel-button title-main-button';
  extractBtn.textContent = '提取';
  
  // 添加优化按钮
  const optimizeBtn = document.createElement('button');
  optimizeBtn.className = 'replace-panel-button title-main-button';
  optimizeBtn.textContent = '优化';
  optimizeBtn.addEventListener('click', function() {
    // 检查是否有提取的标题
    if (!extractInput.value.trim()) {
      showPanelStatus('请先提取标题内容', 'error', status);
      return;
    }
    
    // 调用API优化标题
    optimizeTitle(extractInput.value);
  });

  extractBtn.addEventListener('click', function() {
    // 查找页面中的标题输入框
    const titleInputs = Array.from(document.querySelectorAll('input[type="text"], textarea')).filter(input => {
      // 排除面板内的元素
      if (isElementInPanel(input)) return false;
      
      // 检查是否可能是标题输入框
      const value = input.value.trim();
      return value.length > 10 && value.length < 200;
    });
    
    // 首先尝试查找特定类名的元素
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
    } else if (titleInputs.length > 0) {
      // 如果没有找到特定类名的元素，使用过滤后的第一个输入框
      extractInput.value = titleInputs[0].value;
      showPanelStatus('已提取商品标题', 'success', status);
    } else {
      extractInput.value = '';
      showPanelStatus('未找到标题输入框', 'error', status);
    }
  });

  buttonContainer.appendChild(extractBtn);
  buttonContainer.appendChild(optimizeBtn);

  extractGroup.appendChild(extractLabel);
  extractGroup.appendChild(extractInput);
  extractGroup.appendChild(buttonContainer);
  
  // 创建辅助函数：创建每组建议输入框
  function createSuggestionGroup(groupNumber) {
    const group = document.createElement('div');
    group.className = 'title-suggestion-group';
    group.dataset.group = groupNumber;
    
    // 建议输入框行
    const suggestionRow = document.createElement('div');
    suggestionRow.className = 'title-suggestion-row';
    suggestionRow.dataset.group = groupNumber;
    
    const suggestionLabel = document.createElement('span');
    suggestionLabel.className = 'title-suggestion-label';
    suggestionLabel.textContent = '建议：';
    
    // 使用textarea替代input
    const suggestionInput = document.createElement('textarea');
    suggestionInput.className = 'title-suggestion-input';
    suggestionInput.disabled = true;
    suggestionInput.placeholder = `建议标题 ${groupNumber} 内容`;
    suggestionInput.id = `title-suggestion-${groupNumber}`;
    suggestionInput.rows = 2; // 设置默认行数为2
    
    // 将标签和输入框添加到行中
    suggestionRow.appendChild(suggestionLabel);
    suggestionRow.appendChild(suggestionInput);
    
    // 中文输入框行
    const chineseRow = document.createElement('div');
    chineseRow.className = 'title-suggestion-row';
    chineseRow.dataset.group = groupNumber;
    
    const chineseLabel = document.createElement('span');
    chineseLabel.className = 'title-suggestion-label';
    chineseLabel.textContent = '中文：';
    
    // 使用textarea替代input
    const chineseInput = document.createElement('textarea');
    chineseInput.className = 'title-suggestion-input';
    chineseInput.disabled = true;
    chineseInput.placeholder = `中文标题 ${groupNumber} 内容`;
    chineseInput.id = `title-chinese-${groupNumber}`;
    chineseInput.rows = 2; // 设置默认行数为2
    
    // 添加标签和输入框到中文行
    chineseRow.appendChild(chineseLabel);
    chineseRow.appendChild(chineseInput);
    
    // 创建应用按钮和推荐指数容器
    const buttonScoreContainer = document.createElement('div');
    buttonScoreContainer.className = 'button-score-container';
    
    const applyBtn = document.createElement('button');
    applyBtn.className = 'title-apply-btn';
    applyBtn.textContent = '应用';
    applyBtn.disabled = true;
    applyBtn.dataset.group = groupNumber;
    applyBtn.addEventListener('click', function() {
      applyTitleSuggestion(suggestionInput.value);
    });
    
    // 推荐指数元素
    const scoreElement = document.createElement('div');
    scoreElement.className = 'title-recommendation-score';
    scoreElement.id = `title-score-${groupNumber}`;
    scoreElement.textContent = '推荐指数: -';
    
    // 将按钮和推荐指数添加到容器
    buttonScoreContainer.appendChild(applyBtn);
    buttonScoreContainer.appendChild(scoreElement);
    
    // 将所有元素添加到建议组
    group.appendChild(suggestionRow);
    group.appendChild(chineseRow);
    group.appendChild(buttonScoreContainer); // 直接添加到group，而不是suggestionRow
    
    return {
      group,
      inputs: {
        suggestion: suggestionInput,
        chinese: chineseInput
      },
      scoreElement: scoreElement,
      buttons: {
        suggestion: applyBtn
      }
    };
  }
  
  // 应用标题建议到页面
  function applyTitleSuggestion(suggestionText) {
    if (!suggestionText.trim()) {
      showPanelStatus('建议内容为空，无法应用', 'error', status);
      return;
    }
    
    // 查找目标input
    const panel = document.querySelector('.chat-gpt-panel.is-title');
    let foundInput = null;
    if (panel) {
      const inputs = panel.querySelectorAll('input');
      if (inputs.length > 0) {
        foundInput = inputs[0];
      }
    }
    
    if (foundInput) {
      // 设置输入框的值并触发事件
      foundInput.value = suggestionText;
      triggerInputEvent(foundInput);
      showPanelStatus('已应用标题建议', 'success', status);
    } else {
      showPanelStatus('未找到目标输入框', 'error', status);
    }
  }
  
  // 创建三组建议输入框
  const group1 = createSuggestionGroup(1);
  const group2 = createSuggestionGroup(2);
  const group3 = createSuggestionGroup(3);
  
  // 组装标题优化标签内容
  titleContent.appendChild(extractGroup);
  titleContent.appendChild(group1.group);
  titleContent.appendChild(group2.group);
  titleContent.appendChild(group3.group);
  
  // 3. SKU优化标签内容
  const skuContent = document.createElement('div');
  skuContent.className = 'tab-content';
  skuContent.dataset.tab = 'sku';
  
  // 创建SKU顶部按钮容器
  const skuTopButtons = document.createElement('div');
  skuTopButtons.className = 'sku-top-buttons';
  
  const skuExtractBtn = document.createElement('button');
  skuExtractBtn.className = 'replace-panel-button title-main-button';
  skuExtractBtn.textContent = '提取SKU';
  skuExtractBtn.addEventListener('click', extractSkuValues);

  const skuOptimizeBtn = document.createElement('button');
  skuOptimizeBtn.className = 'replace-panel-button title-main-button sku-optimize-btn';
  skuOptimizeBtn.textContent = 'AI优化';
  skuOptimizeBtn.disabled = true; // 初始禁用
  skuOptimizeBtn.addEventListener('click', optimizeSkuNames);
  
  const applyAllBtn = document.createElement('button');
  applyAllBtn.className = 'replace-panel-button sku-apply-all-btn';
  applyAllBtn.textContent = '一键应用';
  applyAllBtn.id = 'sku-apply-all-btn';
  applyAllBtn.disabled = true; // 初始禁用
  applyAllBtn.addEventListener('click', applyAllSkuValues);
  
  skuTopButtons.appendChild(skuExtractBtn);
  skuTopButtons.appendChild(skuOptimizeBtn);
  skuTopButtons.appendChild(applyAllBtn);
  skuContent.appendChild(skuTopButtons);
  
  // 创建SKU内容容器（带滚动条）
  const skuContainer = document.createElement('div');
  skuContainer.className = 'sku-container';
  skuContainer.id = 'sku-container';
  skuContent.appendChild(skuContainer);
  
  // 4. 其他内容标签内容
  const otherContent = document.createElement('div');
  otherContent.className = 'tab-content';
  otherContent.dataset.tab = 'other';

  // 创建产品描述卡片
  const descriptionCard = document.createElement('div');
  descriptionCard.className = 'other-content-card';

  const descriptionTitle = document.createElement('h3');
  descriptionTitle.className = 'other-content-title';
  descriptionTitle.textContent = '产品描述文字移除';

  const descriptionExtractBtn = document.createElement('button');
  descriptionExtractBtn.className = 'replace-panel-button';
  descriptionExtractBtn.textContent = '提取内容';
  descriptionExtractBtn.style.flex = 'none';
  descriptionExtractBtn.style.width = '120px';


  const descriptionStatus = document.createElement('div');
  descriptionStatus.className = 'other-content-status';
  descriptionStatus.textContent = '请点击提取按钮';

  descriptionCard.appendChild(descriptionTitle);
  descriptionCard.appendChild(descriptionExtractBtn);
  descriptionCard.appendChild(descriptionStatus);

  otherContent.appendChild(descriptionCard);

  // 创建批量填充库存卡片
  const inventoryCard = document.createElement('div');
  inventoryCard.className = 'other-content-card';

  const inventoryTitle = document.createElement('h3');
  inventoryTitle.className = 'other-content-title';
  inventoryTitle.textContent = '批量填入库存';

  const inventoryContainer = document.createElement('div');
  inventoryContainer.className = 'other-content-container';

  const inventoryInput = document.createElement('input');
  inventoryInput.type = 'number';
  inventoryInput.className = 'replace-panel-input';
  inventoryInput.value = '500';
  inventoryInput.style.width = '120px';

  const inventoryApplyBtn = document.createElement('button');
  inventoryApplyBtn.className = 'replace-panel-button';
  inventoryApplyBtn.textContent = '应用';
  inventoryApplyBtn.style.flex = 'none';
  inventoryApplyBtn.style.width = '120px';

  inventoryContainer.appendChild(inventoryInput);
  inventoryContainer.appendChild(inventoryApplyBtn);

  inventoryCard.appendChild(inventoryTitle);
  inventoryCard.appendChild(inventoryContainer);

  otherContent.appendChild(inventoryCard);

  // 创建物流信息卡片
  const logisticsCard = document.createElement('div');
  logisticsCard.className = 'other-content-card';

  const logisticsTitle = document.createElement('h3');
  logisticsTitle.className = 'other-content-title';
  logisticsTitle.textContent = '设置物流信息';

  const logisticsInputsContainer = document.createElement('div');
  logisticsInputsContainer.className = 'logistics-inputs-container';

  // 创建输入框和标签的辅助函数
  function createLogisticsInput(labelText) {
    const wrapper = document.createElement('div');
    wrapper.className = 'logistics-input-wrapper';
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'replace-panel-input';
    input.readOnly = true;
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return { wrapper, input };
  }

  const weightGroup = createLogisticsInput('包裹重量:');
  const lengthGroup = createLogisticsInput('长:');
  const widthGroup = createLogisticsInput('宽:');
  const heightGroup = createLogisticsInput('高:');

  logisticsInputsContainer.appendChild(weightGroup.wrapper);
  logisticsInputsContainer.appendChild(lengthGroup.wrapper);
  logisticsInputsContainer.appendChild(widthGroup.wrapper);
  logisticsInputsContainer.appendChild(heightGroup.wrapper);

  const logisticsControlsContainer = document.createElement('div');
  logisticsControlsContainer.className = 'other-content-container';
  logisticsControlsContainer.style.marginTop = '15px';

  const logisticsExtractBtn = document.createElement('button');
  logisticsExtractBtn.className = 'replace-panel-button';
  logisticsExtractBtn.textContent = '提取';
  logisticsExtractBtn.style.flex = 'none';
  logisticsExtractBtn.style.width = '120px';

  const logisticsApplyBtn = document.createElement('button');
  logisticsApplyBtn.className = 'replace-panel-button';
  logisticsApplyBtn.textContent = '应用';
  logisticsApplyBtn.style.flex = 'none';
  logisticsApplyBtn.style.width = '120px';
  logisticsApplyBtn.disabled = true;

  const logisticsApplyDefaultBtn = document.createElement('button');
  logisticsApplyDefaultBtn.className = 'replace-panel-button';
  logisticsApplyDefaultBtn.textContent = '应用默认';
  logisticsApplyDefaultBtn.style.flex = 'none';
  logisticsApplyDefaultBtn.style.width = '120px';

  logisticsControlsContainer.appendChild(logisticsExtractBtn);
  logisticsControlsContainer.appendChild(logisticsApplyBtn);
  logisticsControlsContainer.appendChild(logisticsApplyDefaultBtn);

  logisticsCard.appendChild(logisticsTitle);
  logisticsCard.appendChild(logisticsInputsContainer);
  logisticsCard.appendChild(logisticsControlsContainer);

  otherContent.appendChild(logisticsCard);

  let originalLogisticsElements = {};

  logisticsApplyDefaultBtn.addEventListener('click', () => {
    // 1. 查找页面元素
    const allInputs = document.querySelectorAll('input.jx-input__inner');
    if (allInputs.length < 4) {
      showPanelStatus(`需要至少4个 'jx-input__inner' 输入框，但只找到 ${allInputs.length} 个`, 'error', status);
      return;
    }
    const lastFourInputs = Array.from(allInputs).slice(-4);
    const heightInputElement = lastFourInputs[3];
    const widthInputElement  = lastFourInputs[2];
    const lengthInputElement = lastFourInputs[1];
    const weightInputElement = lastFourInputs[0];

    // 保存原始元素引用以便"应用"按钮可用
    originalLogisticsElements = {
      weight: weightInputElement,
      length: lengthInputElement,
      width: widthInputElement,
      height: heightInputElement,
    };

    // 2. 定义并设置默认值
    const defaultValues = { weight: '60', length: '20', width: '13', height: '3' };
    
    // 更新面板输入框
    weightGroup.input.value = defaultValues.weight;
    lengthGroup.input.value = defaultValues.length;
    widthGroup.input.value = defaultValues.width;
    heightGroup.input.value = defaultValues.height;
    
    // 更新页面输入框并触发事件
    weightInputElement.value = defaultValues.weight;
    triggerInputEvent(weightInputElement);
    lengthInputElement.value = defaultValues.length;
    triggerInputEvent(lengthInputElement);
    widthInputElement.value = defaultValues.width;
    triggerInputEvent(widthInputElement);
    heightInputElement.value = defaultValues.height;
    triggerInputEvent(heightInputElement);
    
    // 3. 更新UI状态
    [weightGroup, lengthGroup, widthGroup, heightGroup].forEach(g => g.input.readOnly = false);
    logisticsApplyBtn.disabled = false;
    showPanelStatus('已应用默认物流信息', 'success', status);
  });

  logisticsExtractBtn.addEventListener('click', () => {
    const allInputs = document.querySelectorAll('input.jx-input__inner');

    // 重置状态
    originalLogisticsElements = {};
    const inputGroups = [weightGroup, lengthGroup, widthGroup, heightGroup];
    inputGroups.forEach(group => {
      group.input.value = '';
      group.input.readOnly = true;
    });
    logisticsApplyBtn.disabled = true;

    if (allInputs.length < 4) {
      showPanelStatus(`需要至少4个 'jx-input__inner' 输入框，但只找到 ${allInputs.length} 个`, 'error', status);
      return;
    }

    // 提取最后四个input元素
    const lastFourInputs = Array.from(allInputs).slice(-4);
    
    // 从后往前分别是 高、宽、长、重量
    const heightInputElement = lastFourInputs[3];
    const widthInputElement  = lastFourInputs[2];
    const lengthInputElement = lastFourInputs[1];
    const weightInputElement = lastFourInputs[0];
    
    // 填充到面板并保存原始元素引用
    originalLogisticsElements.weight = weightInputElement;
    weightGroup.input.value = weightInputElement.value;
    weightGroup.input.readOnly = false;

    originalLogisticsElements.length = lengthInputElement;
    lengthGroup.input.value = lengthInputElement.value;
    lengthGroup.input.readOnly = false;

    originalLogisticsElements.width = widthInputElement;
    widthGroup.input.value = widthInputElement.value;
    widthGroup.input.readOnly = false;

    originalLogisticsElements.height = heightInputElement;
    heightGroup.input.value = heightInputElement.value;
    heightGroup.input.readOnly = false;

    logisticsApplyBtn.disabled = false;
    showPanelStatus('物流信息提取成功', 'success', status);
  });

  logisticsApplyBtn.addEventListener('click', () => {
    if (originalLogisticsElements.weight) {
      originalLogisticsElements.weight.value = weightGroup.input.value;
      triggerInputEvent(originalLogisticsElements.weight);
    }
    if (originalLogisticsElements.length) {
      originalLogisticsElements.length.value = lengthGroup.input.value;
      triggerInputEvent(originalLogisticsElements.length);
    }
    if (originalLogisticsElements.width) {
      originalLogisticsElements.width.value = widthGroup.input.value;
      triggerInputEvent(originalLogisticsElements.width);
    }
    if (originalLogisticsElements.height) {
      originalLogisticsElements.height.value = heightGroup.input.value;
      triggerInputEvent(originalLogisticsElements.height);
    }
    showPanelStatus('物流信息已应用', 'success', status);
  });
  
  // 为库存应用按钮添加事件监听器
  inventoryApplyBtn.addEventListener('click', () => {
    const stockValue = inventoryInput.value;
    if (stockValue === '' || isNaN(stockValue)) {
      showPanelStatus('请输入有效的库存数量', 'error', status);
      return;
    }

    const targetWrappers = document.querySelectorAll('.jx-input.jx-input--small.jx-input--suffix.pro-input.jx-tooltip__trigger');
    let count = 0;
    targetWrappers.forEach(wrapper => {
      const inputElement = wrapper.querySelector('input');
      if (inputElement) {
        inputElement.value = stockValue;
        triggerInputEvent(inputElement);
        count++;
      }
    });
    
    showPanelStatus(`成功将 ${count} 个项目的库存设置为 ${stockValue}`, 'success', status);
  });

  // 为描述提取按钮添加事件监听器
  descriptionExtractBtn.addEventListener('click', () => {
    const iframe = document.querySelector('iframe.tox-edit-area__iframe');
    descriptionStatus.innerHTML = ''; // 清除之前的状态

    if (!iframe) {
      descriptionStatus.textContent = '错误：未找到产品描述编辑器 (iframe.tox-edit-area__iframe)';
      return;
    }

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const pElements = iframeDoc.querySelectorAll('p');

      if (pElements.length > 0) {
        let textSnippet = Array.from(pElements).map(p => p.textContent.trim()).join(' ').substring(0, 100);
        if (textSnippet.length === 100) textSnippet += '...';
        
        const statusText = document.createElement('span');
        statusText.textContent = `识别到文字：${textSnippet}`;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '全部删除';
        deleteBtn.className = 'replace-panel-button';
        deleteBtn.style.marginLeft = '10px';
        deleteBtn.style.backgroundColor = '#ea4335';
        deleteBtn.style.flex = 'none';
        deleteBtn.style.width = '120px';

        deleteBtn.addEventListener('click', () => {
          const pElementsToDelete = iframeDoc.querySelectorAll('p');
          pElementsToDelete.forEach(p => p.remove());
          descriptionStatus.textContent = '所有P标签元素已删除。';
        });

        descriptionStatus.appendChild(statusText);
        descriptionStatus.appendChild(deleteBtn);

      } else {
        descriptionStatus.textContent = '未识别到P标签文字';
      }
    } catch (e) {
      descriptionStatus.textContent = `发生错误: ${e.message}`;
      console.error("Error accessing iframe content:", e);
    }
  });
  
  // 状态信息（共享所有标签页）
  const status = document.createElement('div');
  status.className = 'replace-panel-status';
  
  // 将所有标签内容添加到面板
  content.appendChild(titleContent);
  content.appendChild(skuContent);
  content.appendChild(otherContent);
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
  
  // 不再需要替换功能相关的事件监听
  
  // 添加面板拖动功能
  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    
    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    
    // 限制面板在视口内
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
  
  // 添加到面板容器
  container.appendChild(panel);
  container.appendChild(toggleButton);
  
  // 返回创建的面板
  return panel;
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

/**
 * 显示设置模态窗口
 */
function showSettingsModal() {
  // 检查是否已有模态窗口
  if (document.querySelector('.api-settings-modal')) {
    return;
  }
  
  // 创建模态窗口背景
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'api-settings-overlay';
  modalOverlay.style.position = 'fixed';
  modalOverlay.style.top = '0';
  modalOverlay.style.left = '0';
  modalOverlay.style.width = '100vw';
  modalOverlay.style.height = '100vh';
  modalOverlay.style.zIndex = '2147483648';
  
  // 创建模态窗口
  const modal = document.createElement('div');
  modal.className = 'api-settings-modal';
  
  // 创建模态窗口标题
  const modalTitle = document.createElement('h3');
  modalTitle.textContent = 'API 参数设置';
  
  // 创建表单
  const form = document.createElement('div');
  form.className = 'api-settings-form';
  
  // API Key 设置
  const apiKeyGroup = createSettingGroup('API Key', 'apiKey', apiSettings.apiKey);
  
  // 模型设置
  const modelGroup = createSettingGroup('模型', 'model', apiSettings.model);
  
  // 温度设置
  const tempGroup = createSettingGroup('温度 (0-2)', 'temperature', apiSettings.temperature);
  
  // 最大令牌数设置
  const maxTokensGroup = createSettingGroup('最大令牌数', 'max_tokens', apiSettings.max_tokens);
  
  // 底部按钮
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'api-settings-buttons';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.className = 'api-settings-button api-cancel-btn';
  cancelBtn.addEventListener('click', () => {
    modalOverlay.remove();
  });
  
  const saveBtn = document.createElement('button');
  saveBtn.textContent = '保存';
  saveBtn.className = 'api-settings-button api-save-btn';
  saveBtn.addEventListener('click', () => {
    // 保存设置
    apiSettings.apiKey = document.getElementById('setting-apiKey').value;
    apiSettings.model = document.getElementById('setting-model').value;
    apiSettings.temperature = parseFloat(document.getElementById('setting-temperature').value);
    apiSettings.max_tokens = parseInt(document.getElementById('setting-max_tokens').value);
    
    // 关闭模态窗口
    modalOverlay.remove();
    
    showPanelStatus('API设置已保存', 'success', status);
  });
  
  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(saveBtn);
  
  // 组装模态窗口
  form.appendChild(apiKeyGroup);
  form.appendChild(modelGroup);
  form.appendChild(tempGroup);
  form.appendChild(maxTokensGroup);
  
  modal.appendChild(modalTitle);
  modal.appendChild(form);
  modal.appendChild(buttonContainer);
  
  modalOverlay.appendChild(modal);
  
  // 将模态窗口添加到document.body而不是panelContainer
  // 这样可以确保它不会被其他元素遮挡
  document.body.appendChild(modalOverlay);
  
  // 确保模态窗口在最上层
  modalOverlay.style.zIndex = '2147483648';
  modal.style.zIndex = '2147483648';
  
  // 防止点击模态窗口背景关闭
  modal.addEventListener('click', (e) => e.stopPropagation());
  
  // 点击背景关闭模态窗口
  modalOverlay.addEventListener('click', () => {
    modalOverlay.remove();
  });
}

/**
 * 创建设置项组
 */
function createSettingGroup(label, id, value) {
  const group = document.createElement('div');
  group.className = 'api-settings-group';
  
  const labelElement = document.createElement('label');
  labelElement.textContent = label;
  labelElement.htmlFor = `setting-${id}`;
  
  const input = document.createElement('input');
  input.type = typeof value === 'number' ? 'number' : 'text';
  input.id = `setting-${id}`;
  input.value = value;
  
  // 设置温度范围
  if (id === 'temperature') {
    input.min = '0';
    input.max = '2';
    input.step = '0.1';
  }
  
  // 禁用模型输入框
  if (id === 'model') {
    input.disabled = true;
    input.style.backgroundColor = '#f0f0f0';
    input.title = '模型参数不可更改';
  }
  
  group.appendChild(labelElement);
  group.appendChild(input);
  
  return group;
}

/**
 * 使用API优化标题
 */
function optimizeTitle(title) {
  // 显示加载状态
  showPanelStatus('正在优化标题...', 'info', status);
  
  // 禁用优化按钮
  const optimizeBtn = document.querySelector('.title-main-button:nth-child(2)');
  if (optimizeBtn) optimizeBtn.disabled = true;
  
  // 显示加载动画
  const titleTabContent = document.querySelector('.tab-content[data-tab="title"]');
  const loadingOverlay = document.createElement('div');
  loadingOverlay.className = 'loading-overlay';
  loadingOverlay.id = 'title-loading-overlay';
  
  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  
  const loadingText = document.createElement('div');
  loadingText.className = 'loading-text';
  loadingText.textContent = 'AI正在优化标题中...';
  
  loadingOverlay.appendChild(spinner);
  loadingOverlay.appendChild(loadingText);
  titleTabContent.appendChild(loadingOverlay);
  
  // 请求参数
  const requestData = {
    model: apiSettings.model,
    temperature: apiSettings.temperature,
    max_tokens: apiSettings.max_tokens,
    messages: [
      {
        role: "system",
        content: `# System Prompt：跨境电商商品标题优化助手

你是一个精通跨境电商营销的商品标题优化专家。你的任务是根据用户提供的中文商品标题，为其生成 3 个高质量、适合跨境电商平台TikTok（主要是东南亚地区）的英文标题建议，并为每个英文标题提供一句对应的中文释义和推荐指数。

## 生成要求：

1. **突出商品卖点**，包含[商品品牌] + [商品详情] + [适用范围] + [商品类型] + [主要功能/特点/优势]关键词，关键词要符合跨境电商营销的搜索习惯；
2. **使用目标市场用户更容易搜索的英文关键词和热门关键词**；
3. **不要简单直译**，要结合电商平台流行语和惯用表达；
4. **标题长度控制在合理范围**（一般在60到100 字符，包括空格）；
5. **关键词应该与产品相关，不要包含特殊符号或无关词语**（如 🔥、Free shipping 等）；
6. **不得包含URL、符号、特殊字符和非语言ASCII字符**；
7. **每个单词的首字母大写**（连词、冠词、介词、手机品牌除外)。
8. **标题中除iPhone以外的手机品牌，一律使用小写字母。例如：华为使用huawei，小米使用xiaomi，红米使用redmi，不要使用Huawei、Xiaomi、Redmi**；
9. **需要返回 3 组标题建议**，每组包含英文和中文解释和推荐指数；
10. **推荐指数为1-10，1为最不推荐，10为最推荐**；推荐指数评分规则如下：

推荐指数用于衡量英文标题在跨境电商平台上的**潜在吸引力和搜索优化质量**，综合考虑以下 6 个维度，总分为 10 分：

| 评分维度           | 描述                                                           | 分值范围 |
|--------------------|----------------------------------------------------------------|----------|
| ① 关键词匹配度     | 是否包含平台热门搜索关键词，是否贴近用户搜索习惯              | 0–2 分   |
| ② 卖点表达清晰度   | 是否突出商品功能、优势、使用场景等核心卖点                    | 0–2 分   |
| ③ 英语表达自然度   | 是否符合英语母语用户的阅读习惯，是否流畅自然                   | 0–2 分   |
| ④ 标题结构合理性   | 是否结构清晰、不啰嗦，无关键词堆砌或逻辑混乱                  | 0–1 分   |
| ⑤ 市场吸引力       | 是否具有营销性，是否具备吸引点击的潜力                        | 0–1 分   |
| ⑥ 关键词覆盖度     | 是否包含多个相关和热门的关键词，避免过度简短化                  | 0–2 分   |

11. **返回内容格式必须是 JSON**，格式如下：

\`\`\`json
{
  "sug1": "英文标题建议1",
  "cn1": "中文解释1",
  "score1": "推荐指数1",
  "sug2": "英文标题建议2",
  "cn2": "中文解释2",
  "score2": "推荐指数2",
  "sug3": "英文标题建议3",
  "cn3": "中文解释3",
  "score3": "推荐指数3"
}
\`\`\`

注意事项：
用户输入的内容是一个中文商品标题；
你只需根据该标题输出建议；
不要添加任何额外说明，只返回 JSON 格式内容。`
      },
      {
        role: "user",
        content: `请优化以下商品标题，提供三个不同的优化建议，分别输出英文和中文版本和推荐指数。
原标题：${title}`
      }
    ],
    response_format: { type: "json_object" }
  };
  
  // 发送API请求
  fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiSettings.apiKey}`
    },
    body: JSON.stringify(requestData)
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      // 处理返回结果
      handleApiResponse(data);
    })
    .catch(error => {
      showPanelStatus(`优化失败: ${error.message}`, 'error', status);
    })
    .finally(() => {
      // 移除加载动画
      const loadingOverlay = document.getElementById('title-loading-overlay');
      if (loadingOverlay) {
        loadingOverlay.remove();
      }
      
      // 恢复优化按钮
      if (optimizeBtn) optimizeBtn.disabled = false;
    });
}

/**
 * 处理API响应数据
 */
function handleApiResponse(data) {
  try {
    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      throw new Error('API响应数据格式不正确');
    }
    
    // 解析JSON响应
    const content = data.choices[0].message.content;
    const suggestions = JSON.parse(content);
    
    // 验证返回数据
    const requiredKeys = ['sug1', 'cn1', 'score1', 'sug2', 'cn2', 'score2', 'sug3', 'cn3', 'score3'];
    for (const key of requiredKeys) {
      if (!suggestions[key]) {
        throw new Error(`API返回数据缺少 ${key} 字段`);
      }
    }
    
    // 更新输入框内容并启用按钮
    updateSuggestionInputs(suggestions);
    
    showPanelStatus('标题优化成功!', 'success', status);
  } catch (error) {
    console.error('处理API响应时出错:', error);
    showPanelStatus(`处理API响应数据失败: ${error.message}`, 'error', status);
  }
}

/**
 * 更新建议输入框
 */
function updateSuggestionInputs(suggestions) {
  // 更新第一组
  document.getElementById('title-suggestion-1').value = suggestions.sug1;
  document.getElementById('title-chinese-1').value = suggestions.cn1;
  document.getElementById('title-score-1').textContent = `推荐: ${suggestions.score1}/10`;
  document.getElementById('title-score-1').className = 'title-recommendation-score score-level-' + getScoreLevel(suggestions.score1);
  document.getElementById('title-suggestion-1').disabled = false;
  document.getElementById('title-chinese-1').disabled = false;
  
  // 启用第一组按钮 - 只有英文建议的应用按钮
  document.querySelector(`.title-suggestion-group[data-group="1"] .title-apply-btn`).disabled = false;
  
  // 更新第二组
  document.getElementById('title-suggestion-2').value = suggestions.sug2;
  document.getElementById('title-chinese-2').value = suggestions.cn2;
  document.getElementById('title-score-2').textContent = `推荐: ${suggestions.score2}/10`;
  document.getElementById('title-score-2').className = 'title-recommendation-score score-level-' + getScoreLevel(suggestions.score2);
  document.getElementById('title-suggestion-2').disabled = false;
  document.getElementById('title-chinese-2').disabled = false;
  
  // 启用第二组按钮 - 只有英文建议的应用按钮
  document.querySelector(`.title-suggestion-group[data-group="2"] .title-apply-btn`).disabled = false;
  
  // 更新第三组
  document.getElementById('title-suggestion-3').value = suggestions.sug3;
  document.getElementById('title-chinese-3').value = suggestions.cn3;
  document.getElementById('title-score-3').textContent = `推荐: ${suggestions.score3}/10`;
  document.getElementById('title-score-3').className = 'title-recommendation-score score-level-' + getScoreLevel(suggestions.score3);
  document.getElementById('title-suggestion-3').disabled = false;
  document.getElementById('title-chinese-3').disabled = false;
  
  // 启用第三组按钮 - 只有英文建议的应用按钮
  document.querySelector(`.title-suggestion-group[data-group="3"] .title-apply-btn`).disabled = false;
}

/**
 * 根据分数获取等级
 */
function getScoreLevel(score) {
  score = parseInt(score);
  if (score >= 9) return 'high';
  if (score >= 7) return 'medium';
  return 'low';
}

/**
 * 提取SKU值
 */
function extractSkuValues() {
  const status = document.querySelector('.replace-panel-status');
  showPanelStatus('正在提取SKU...', 'info', status);

  const skuContainer = document.getElementById('sku-container');
  if (skuContainer) {
    skuContainer.innerHTML = '';
  }

  const specGroups = document.querySelectorAll('.sale-attribute-value-box');
  if (!specGroups || specGroups.length === 0) {
    showPanelStatus('未找到SKU规格组', 'error', status);
    return;
  }

  let totalSkuCount = 0;
  const skuCounts = []; // 用于存储每个组的SKU数量
  window.skuMappings = []; // 将成为一个二维数组

  // 遍历每个规格组
  specGroups.forEach((group, index) => {
    const groupMappings = [];
    const specGroupContainer = document.createElement('div');
    specGroupContainer.className = 'sku-spec-group';

    const skuInputs = group.querySelectorAll('.jx-input__inner');
    const currentSkuCount = skuInputs.length;
    skuCounts.push(currentSkuCount);

    // 规格标题，包含SKU数量和应用按钮
    const specGroupTitle = document.createElement('div');
    specGroupTitle.className = 'sku-spec-title';
    
    const titleText = document.createElement('span');
    titleText.textContent = `规格 ${index + 1} (${currentSkuCount}个 SKU):`;
    specGroupTitle.appendChild(titleText);
    
    // 为每个规格添加批量应用按钮
    if (currentSkuCount > 0) {
        const specApplyBtn = document.createElement('button');
        specApplyBtn.className = 'sku-spec-apply-btn';
        specApplyBtn.textContent = `应用规格`;
        specApplyBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止触发其他事件
            applySpecGroupSkuValues(index);
        });
        specGroupTitle.appendChild(specApplyBtn);
    }

    // 为通用术语预留位置
    const commonTermsContainer = document.createElement('div');
    commonTermsContainer.className = 'common-terms-container';
    specGroupTitle.appendChild(commonTermsContainer);

    specGroupContainer.appendChild(specGroupTitle);

    const skuValuesContainer = document.createElement('div');
    skuValuesContainer.className = 'sku-values-container';

    if (currentSkuCount > 0) {
      skuInputs.forEach(skuInput => {
        const skuValue = skuInput.value || skuInput.textContent || ""; // 如果为空，则使用空字符串
        
        const skuValueInput = document.createElement('input');
        skuValueInput.type = 'text';
        skuValueInput.className = 'sku-value-input';
        skuValueInput.value = skuValue.trim();

        groupMappings.push({
          panelInput: skuValueInput,
          originalElement: skuInput
        });

        const skuValueItem = document.createElement('div');
        skuValueItem.className = 'sku-value-item';
        skuValueItem.appendChild(skuValueInput);
        
        // 创建一个空的原始SKU文本节点作为占位符，稍后会由AI优化函数填充
        const originalSkuText = document.createElement('div');
        originalSkuText.className = 'original-sku-text';
        skuValueItem.appendChild(originalSkuText);
        
        // 创建输入框包装器，用于并排放置输入框和删除链接
        const inputWrapper = document.createElement('div');
        inputWrapper.style.display = 'flex';
        inputWrapper.style.alignItems = 'center';
        inputWrapper.style.width = '100%';
        
        // 将输入框从skuValueItem中移除并添加到包装器中
        skuValueItem.removeChild(skuValueInput);
        inputWrapper.appendChild(skuValueInput);
        
        // 创建删除链接
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'sku-delete-link';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', () => {
            // 从原始输入框向上查找包含所需类的父级容器
            const wrapper = skuInput.closest('.jx-input.jx-input-group--append');
            
            if (wrapper) {
                // 直接在包装器内部查找按钮
                const buttonToDelete = wrapper.querySelector('.jx-input-group__append button');
                
                if (buttonToDelete) {
                    buttonToDelete.click();
                    
                    // 等待DOM更新后重新提取
                    setTimeout(() => {
                        extractSkuValues();
                    }, 300); // 300ms的延迟以确保DOM已更新
                }
            }
        });
        inputWrapper.appendChild(deleteBtn);
        
        // 将包装器添加到skuValueItem
        skuValueItem.appendChild(inputWrapper);

        skuValuesContainer.appendChild(skuValueItem);
        totalSkuCount++;
      });
    }
    
    window.skuMappings.push(groupMappings);

    specGroupContainer.appendChild(skuValuesContainer);
    
    skuContainer.appendChild(specGroupContainer);
  });

  // 更新一键应用和AI优化按钮的状态
  const applyAllBtn = document.getElementById('sku-apply-all-btn');
  const skuOptimizeBtn = document.querySelector('.sku-optimize-btn');

  if (totalSkuCount > 0) {
    const totalCombinations = skuCounts.reduce((acc, count) => acc * (count || 1), 1);
    applyAllBtn.textContent = `一键应用所有SKU (组合数: ${totalCombinations})`;
    applyAllBtn.disabled = false; // 启用按钮
    skuOptimizeBtn.disabled = false; // 启用按钮
    showPanelStatus(`成功提取 ${totalSkuCount} 个SKU值，共 ${specGroups.length} 个规格组`, 'success', status);
  } else {
    applyAllBtn.disabled = true; // 禁用按钮
    skuOptimizeBtn.disabled = true; // 禁用按钮
    showPanelStatus('未找到SKU值', 'error', status);
  }
}

/**
 * 应用单个规格组的SKU值
 */
function applySpecGroupSkuValues(groupIndex) {
    const status = document.querySelector('.replace-panel-status');
    if (!window.skuMappings || !window.skuMappings[groupIndex]) {
        showPanelStatus('无法应用，未找到规格组数据', 'error', status);
        return;
    }

    const groupMappings = window.skuMappings[groupIndex];
    let successCount = 0;
    groupMappings.forEach(mapping => {
        try {
            mapping.originalElement.value = mapping.panelInput.value;
            triggerInputEvent(mapping.originalElement);
            successCount++;
        } catch (error) {
            console.error(`应用规格 ${groupIndex + 1} SKU失败:`, error);
        }
    });
    showPanelStatus(`规格 ${groupIndex + 1} 已应用 ${successCount}/${groupMappings.length} 个SKU`, 'success', status);
}

/**
 * 一键应用所有SKU值
 */
function applyAllSkuValues() {
  const status = document.querySelector('.replace-panel-status');
  if (!window.skuMappings || window.skuMappings.length === 0) {
    showPanelStatus('没有可应用的SKU', 'error', status);
    return;
  }

  let successCount = 0;
  let totalCount = 0;
  
  window.skuMappings.forEach(groupMappings => {
    groupMappings.forEach(mapping => {
        totalCount++;
        try {
            mapping.originalElement.value = mapping.panelInput.value;
            triggerInputEvent(mapping.originalElement);
            successCount++;
        } catch (error) {
            console.error('应用SKU失败:', error);
        }
    });
  });

  showPanelStatus(`已应用 ${successCount}/${totalCount} 个SKU值`, 'success', status);
}

function optimizeSkuNames() {
    const status = document.querySelector('.replace-panel-status');
    showPanelStatus('正在进行SKU智能优化...', 'info', status);

    // 禁用按钮
    document.querySelector('.sku-optimize-btn').disabled = true;
    document.querySelector('#sku-apply-all-btn').disabled = true;

    // 显示加载动画
    const skuContainer = document.getElementById('sku-container');
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = `<div class="loading-spinner"></div><div class="loading-text">AI正在优化SKU...</div>`;
    skuContainer.prepend(loadingOverlay);

    // 准备发送给AI的数据
    const dataForAI = window.skuMappings.map((group, index) => {
        return {
            spec_group: index + 1,
            skus: group.map(item => item.panelInput.value)
        };
    });

    const userPrompt = `
请分析以下多组SKU规格，为每一组提取通用词，并对每个SKU进行精简优化。
规格数据:
${JSON.stringify(dataForAI, null, 2)}
`;

    const requestData = {
        model: apiSettings.model,
        temperature: apiSettings.temperature,
        max_tokens: apiSettings.max_tokens,
        messages: [
            {
                role: "system",
                content: `你是一位经验丰富的电商商品数据优化专家，擅长为跨境电商场景中的商品规格信息进行精简处理。

现在你将收到以下信息：
- 多个规格组（如"颜色"、"款式"、"图案"等）
- 所有规格组下多个原始 SKU 名称（中文）

你的任务如下：

1. 分析这些 SKU 名称中出现的 **重复信息（公共词）**，例如统一的品牌名、风格词、材质描述等，并将它们翻译为英文，作为 \`common_terms_en\`；
2. 对每个 SKU 名称进行精简，仅保留真正能区分的部分（即规格差异项）作为 \`optimized_sku\`；
3. 将精简后的 SKU 名称翻译为英文，作为 \`optimized_sku_en\`。注意翻译后的名称要尽可能小于等于45个字符，如果无法避免地超出长度时请返回 out of 45 characters，以引导用户删掉这个sku；
4. 返回包含以下字段的 JSON 对象：
   - \`spec_group\`: 规格组序号
   - \`common_terms\`: 这些 SKU 中出现的公共词
   - \`common_terms_en\`: 公共词的英文翻译
   - \`sku_mappings\`: 一个数组，每项包含：
     - \`original_sku\`: 原始 SKU 名称
     - \`optimized_sku\`: 精简后的 SKU 名称
     - \`optimized_sku_en\`: 精简后的 SKU 名称（翻译为英文）

注意：
- 保持字段结构一致
- 翻译为英文的过程中，要使用目标市场用户更容易搜索的英文关键词和热门关键词；不要简单直译，要结合电商平台流行语和惯用表达；
- 手机型号sku不要提取公共词，翻译时要翻译为对应的英文。比如苹果15要翻译为iPhone 15，不要翻译为Apple 15。
- 若没有公共词，\`common_terms\` 设为空数组
- 公共词一定要是当前规格中所有的sku都包含的内容，例如"可爱狗狗、可爱猫猫、可爱兔兔、帅气猫猫"，不能将"可爱"作为公共词。
- 公共词要合理。例如"红色、蓝色、黄色、绿色"不能将"色"字作为公共词。
- sku公共词不能是手机型号或品牌。例如"iPhone 14 Pro Max、iPhone 14 Pro、iPhone 14、iPhone 13 Pro Max、iPhone 13 Pro"不能将"iPhone"作为公共词。
- 精简时可以适当删去过多的重复描述词，例如"可爱狗狗（壳+可爱超长镶钻挂件）、可爱狗狗（单壳）、帅气猫猫（壳+可爱超长镶钻挂件）、帅气猫猫（单壳）"，可以精简为"可爱狗狗（壳）、可爱狗狗（壳+挂件）、帅气猫猫（壳）、帅气猫猫（壳+挂件）"。

返回格式：
\`\`\`json
{
  "optimizations": [
    {
      "spec_group": 1,
      "common_terms": ["夏日风", "纯棉T恤"],
      "common_terms_en": ["Summer Style", "Cotton T-Shirt"],
      "sku_mappings": [
        { 
          "original_sku": "夏日风纯棉T恤 红色", 
          "optimized_sku": "红色",
          "optimized_sku_en": "Red"
        },
        { 
          "original_sku": "夏日风纯棉T恤 蓝色", 
          "optimized_sku": "蓝色",
          "optimized_sku_en": "Blue"
        }
      ]
    },
    {
      "spec_group": 2,
      "common_terms": [],
      "common_terms_en": [],
      "sku_mappings": [
        { 
          "original_sku": "款式A", 
          "optimized_sku": "款式A",
          "optimized_sku_en": "Style A"
        },
        { 
          "original_sku": "款式B", 
          "optimized_sku": "款式B",
          "optimized_sku_en": "Style B"
        }
      ]
    }
  ]
}
\`\`\`
`
            },
            {
                role: "user",
                content: userPrompt
            }
        ],
        response_format: { type: "json_object" }
    };

    fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiSettings.apiKey}`
        },
        body: JSON.stringify(requestData)
    })
    .then(response => response.json())
    .then(data => handleSkuApiResponse(data))
    .catch(error => {
        showPanelStatus(`SKU优化失败: ${error.message}`, 'error', status);
    })
    .finally(() => {
        // 恢复按钮并移除加载动画
        document.querySelector('.sku-optimize-btn').disabled = false;
        document.querySelector('#sku-apply-all-btn').disabled = false;
        loadingOverlay.remove();
    });
}

function handleSkuApiResponse(data) {
    const status = document.querySelector('.replace-panel-status');
    try {
        if (!data.choices || !data.choices[0].message || !data.choices[0].message.content) {
            throw new Error('API响应数据格式不正确');
        }

        const optimizations = JSON.parse(data.choices[0].message.content).optimizations;
        if (!optimizations || !Array.isArray(optimizations)) {
             throw new Error('API返回数据缺少 optimizations 字段');
        }

        optimizations.forEach(opt => {
            const groupIndex = opt.spec_group - 1;
            const groupMappings = window.skuMappings[groupIndex];
            
            // 更新通用术语
            const titleElement = document.querySelectorAll('.sku-spec-title')[groupIndex];
            if (titleElement) {
                // 查找已存在的通用术语容器
                let commonTermsContainer = titleElement.querySelector('.common-terms-container');
                
                // 如果容器已存在，清空其内容；否则创建一个新的
                if (commonTermsContainer) {
                    commonTermsContainer.innerHTML = '';
                } else {
                    commonTermsContainer = document.createElement('div');
                    commonTermsContainer.className = 'common-terms-container';
                    titleElement.appendChild(commonTermsContainer);
                }
                
                // 创建英文通用术语输入框
                const commonTermsInput = document.createElement('input');
                commonTermsInput.type = 'text';
                commonTermsInput.className = 'common-terms-input';
                commonTermsInput.value = opt.common_terms_en && Array.isArray(opt.common_terms_en) ? 
                    opt.common_terms_en.join(', ') : '';
                
                // 创建中文通用术语描述
                const commonTermsDesc = document.createElement('div');
                commonTermsDesc.className = 'common-terms-desc';
                commonTermsDesc.textContent = opt.common_terms && Array.isArray(opt.common_terms) && opt.common_terms.length > 0 ? 
                    `公共词: ${opt.common_terms.join(', ')}` : '';
                
                // 创建"加入标题"按钮
                const addToTitleBtn = document.createElement('button');
                addToTitleBtn.className = 'add-to-title-btn';
                addToTitleBtn.textContent = '加入标题';
                addToTitleBtn.addEventListener('click', function() {
                    // 查找页面中的标题输入框
                    const titleInputs = Array.from(document.querySelectorAll('input[type="text"], textarea')).filter(input => {
                        // 排除面板内的元素
                        if (isElementInPanel(input)) return false;
                        
                        // 检查是否可能是标题输入框
                        const value = input.value.trim();
                        return value.length > 10 && value.length < 200;
                    });
                    
                    // 首先尝试查找特定类名的元素
                    const panel = document.querySelector('.chat-gpt-panel.is-title');
                    let foundInput = null;
                    if (panel) {
                        const inputs = panel.querySelectorAll('input');
                        if (inputs.length > 0) {
                            foundInput = inputs[0];
                        }
                    }
                    
                    if (foundInput) {
                        // 将通用术语添加到标题末尾
                        foundInput.value = foundInput.value + ' ' + commonTermsInput.value;
                        triggerInputEvent(foundInput);
                        showPanelStatus('已将通用术语添加到标题', 'success', status);
                    } else if (titleInputs.length > 0) {
                        // 如果没有找到特定类名的元素，使用过滤后的第一个输入框
                        titleInputs[0].value = titleInputs[0].value + ' ' + commonTermsInput.value;
                        triggerInputEvent(titleInputs[0]);
                        showPanelStatus('已将通用术语添加到标题', 'success', status);
                    } else {
                        showPanelStatus('未找到标题输入框', 'error', status);
                    }
                });
                
                // 将所有元素添加到容器中，调整顺序：先描述，再输入框，最后按钮
                commonTermsContainer.appendChild(commonTermsDesc);
                commonTermsContainer.appendChild(commonTermsInput);
                commonTermsContainer.appendChild(addToTitleBtn);
            }

            // 更新SKU输入框
            opt.sku_mappings.forEach(mapping => {
                const correspondingMapping = groupMappings.find(m => m.panelInput.value === mapping.original_sku);
                if (correspondingMapping) {
                    // 使用英文翻译作为输入框的值
                    correspondingMapping.panelInput.value = mapping.optimized_sku_en;
                    
                    // 更新或创建原始SKU文本
                    const skuValueItem = correspondingMapping.panelInput.closest('.sku-value-item');
                    if (skuValueItem) {
                        let originalSkuText = skuValueItem.querySelector('.original-sku-text');
                        if (!originalSkuText) {
                            originalSkuText = document.createElement('div');
                            originalSkuText.className = 'original-sku-text';
                            skuValueItem.appendChild(originalSkuText);
                        }
                        // 显示原始和精简后的中文SKU，确保保留空格
                        originalSkuText.textContent = `原始: ${mapping.original_sku} | 优化后: ${mapping.optimized_sku}`;
                    }
                }
            });
        });

        showPanelStatus('SKU智能优化完成！', 'success', status);
    } catch (error) {
        console.error('处理SKU API响应时出错:', error);
        showPanelStatus(`处理响应失败: ${error.message}`, 'error', status);
    }
} 