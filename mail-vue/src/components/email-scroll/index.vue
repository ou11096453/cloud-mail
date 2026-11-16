<template>
  <div class="email-container" :class="{ 'has-mailbox-header': showAccountIcon }">
    <div v-if="showAccountIcon" class="mailbox-header">
      <div class="mailbox-identity">
        <button v-if="canSwitchAccount" type="button" class="mailbox-switcher"
                :aria-label="$t('switchMailbox') + ': ' + currentMailboxLabel"
                :title="$t('switchMailbox')" :aria-expanded="accountShow"
                aria-controls="mailbox-panel" @click="changeAccountShow">
          <Icon icon="akar-icons:dot-grid-fill" width="18" height="18" aria-hidden="true"/>
          <span class="mailbox-address" :title="currentMailboxLabel" translate="no">{{ currentMailboxLabel }}</span>
        </button>
        <div v-else class="mailbox-current">
          <span class="mailbox-address" :title="currentMailboxLabel" translate="no">{{ currentMailboxLabel }}</span>
        </div>
        <button type="button" class="icon-button mailbox-copy"
                :aria-label="$t('copy') + ': ' + currentMailboxLabel" :title="$t('copy')"
                :disabled="!currentMailboxEmail" @click="copyText(currentMailboxEmail)">
          <Icon icon="fluent-color:clipboard-24" width="20" height="20" aria-hidden="true"/>
        </button>
      </div>
      <span class="email-count" v-if="total">{{ $t('emailCount', {total: total}) }}</span>
    </div>
    <div class="header-actions">
      <el-checkbox
          v-model="checkAll"
          :indeterminate="isIndeterminate"
          :disabled="!emailList.length || loading"
          :aria-label="$t('selectAll')"
          @change="handleCheckAllChange"
      >
      </el-checkbox>
      <div class="header-left" :style="'padding-left:' + actionLeft">

        <slot name="first"></slot>
        <button type="button" class="icon-button reload" :aria-label="$t('refresh')" :title="$t('refresh')" @click="refresh">
          <Icon icon="ion:reload" width="18"/>
        </button>
        <button v-perm="'email:delete'" type="button" class="icon-button delete" v-if="checkedEmailCount > 0"
                :aria-label="$t('delete')" :title="$t('delete')" @click="handleDelete">
          <Icon icon="uiw:delete" width="16"/>
        </button>
        <button type="button" class="icon-button" v-if="checkedEmailCount > 0 && showUnread"
                :aria-label="$t('markAsRead')" :title="$t('markAsRead')" @click="handleRead">
          <Icon icon="fluent:mail-read-20-regular" width="21"/>
        </button>
      </div>

      <div v-if="!showAccountIcon" class="header-right">
        <span class="email-count" v-if="total">{{ $t('emailCount', {total: total}) }}</span>
      </div>
    </div>

    <div ref="scroll" class="scroll">
      <UseVirtualList ref="scrollbarRef"
                        @scroll="onScroll"
                        :list="list"
                        :options="{ itemHeight: itemHeight, overscan: 15 }"
                        class="virtual"
                        style="height: 100%"
                        v-if="!loading && emailList.length > 0"
                        :key="keyCount"
        >
          <template #default="{ data: item, index }" >
            <div :class="'email-row ' + props.type"
                 :data-checked="item.checked"
                 @click="jumpDetails(item)"
                 tabindex="0"
                 @keydown.enter.self="jumpDetails(item)"
                 v-if="!item.expand"
                 :key="item.emailId"
                 @contextmenu="handleContextmenu($event, item)"
                 :style="item.rightChecked ? 'background: #FDF6EC' : ''"
            >
              <el-checkbox :class=" props.type === 'all-email' ? 'all-email-checkbox' : 'checkbox'"
                           :aria-label="$t('selectEmail') + ': ' + (item.subject || item.name)"
                           v-model="item.checked" @click.stop></el-checkbox>
              <button type="button" @click.stop="starChange(item)" class="icon-button pc-star" v-if="showStar"
                      :aria-label="$t('star')" :title="$t('star')" :aria-pressed="!!item.isStar"
                      :disabled="item.starPending || (!allowStar && !item.isStar)">
                <Icon v-if="item.isStar" icon="fluent-color:star-16" width="20" height="20"/>
                <Icon v-else icon="solar:star-line-duotone" width="18" height="18"/>
              </button>
              <div v-if="!showStar"></div>
              <div class="title" :class="accountShow ? 'title-column' : 'title-column'">

                <div class="email-sender" :style=" (showStatus ? 'gap: 10px;' : '') + ((item.unread === EmailUnreadEnum.UNREAD && showUnread)  ? 'font-weight: bold' : '')">
                  <div class="email-status" v-if="showStatus">
                    <el-tooltip effect="dark" :content="item.statusIcon.content">
                      <Icon :icon="item.statusIcon.icon" :style="`color: ${item.statusIcon.color}`" width="20" height="20"/>
                    </el-tooltip>
                    <div class="del-status" v-if="item.isDel">
                      <el-tooltip effect="dark" :content="item.isDelContent">
                        <Icon class="icon" icon="mdi:email-remove" width="20" height="20"/>
                      </el-tooltip>
                    </div>
                  </div>
                  <div v-else></div>
                  <span class="name">
                    <span>
                      <div class="unread" v-if="isMobile && (item.unread === EmailUnreadEnum.UNREAD && showUnread) "/>
                      <slot name="name" :email="item"> {{ item.name }}</slot>
                    </span>
                    <span>
                    </span>
                  </span>
                  <span class="phone-time">{{ item.formatCreateTime }}</span>
                </div>
                <div>
                  <div class="email-text">
                    <span class="email-subject" :style="(item.unread === EmailUnreadEnum.UNREAD && showUnread)  ? 'font-weight: bold' : ''">
                      <div class="unread" v-if="!isMobile && (item.unread === EmailUnreadEnum.UNREAD && showUnread) "/>
                      <span v-if="item.code" class="code-tag" @click.stop="copyText(item.code)">[{{ t('codeLabel') }}{{ item.code }}]</span>
                      <span class="subject-text">
                        <slot name="subject" :email="item" >
                          {{ item.subject || '\u200B' }}
                        </slot>
                      </span>
                    </span>
                    <span class="email-content">{{ item.formatText || '\u200B' }}</span>
                  </div>
                  <div class="user-info" v-if="showUserInfo">
                    <div class="user">
                      <span>
                        <Icon icon="mynaui:user" width="20" height="20"/>
                      </span>
                      <span>{{ item.userEmail }}</span>
                    </div>
                    <div class="account">
                      <span>
                        <Icon icon="mdi-light:email" width="20" height="20"/>
                      </span>
                      <span>{{ item.type === 0 ? item.toEmail : item.sendEmail }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="email-right" :style="showUserInfo ? 'align-self: start;':''">
                <span class="email-time" :style="(item.unread === EmailUnreadEnum.UNREAD && showUnread) ? 'font-weight: bold' : ''">{{ item.formatCreateTime }}</span>
              </div>
            </div>
            <skeletonBlock v-else-if="item.expand === 'loading'"
                           :rows="1"
                           :showStar="showStar"
                           :accountShow="accountShow"
                           :showStatus="showStatus"
                           :showUserInfo="showUserInfo"
                           :type="type"/>
            <div class="noLoading" v-else-if="item.expand === 'noMoreData'">
              <div>{{ $t('noMoreData') }}</div>
            </div>
          </template>
        </UseVirtualList>
      <skeletonBlock v-if="firstLoad && showFirstLoading"
                       :rows="20"
                       :showStar="showStar"
                       :accountShow="accountShow"
                       :showStatus="showStatus"
                       :showUserInfo="showUserInfo"
                       :type="type"/>
      <skeletonBlock v-if="loading"
                       :rows="skeletonRows"
                       :showStar="showStar"
                       :accountShow="accountShow"
                       :showStatus="showStatus"
                       :showUserInfo="showUserInfo"
                       :type="type"/>
      <div class="empty" v-if="noLoading && emailList.length === 0 && !loading">
        <el-empty :image-size="isMobile ? 120 : null" :description="$t('noMessagesFound')"/>
      </div>
      <div v-if="loadError && !loading" class="load-error" role="status">
        <span>{{ $t('loadFailed') }}</span>
        <el-button @click="getEmailList(emailList.length === 0)">{{ $t('retry') }}</el-button>
      </div>
    </div>
    <el-dropdown
        ref="dropdownRef"
        @visible-change="visibleChange"
        :virtual-ref="triggerRef"
        :show-arrow="false"
        :popper-options="{
      modifiers: [{ name: 'offset', options: { offset: [0, 0] } }],
    }"
        virtual-triggering
        trigger="contextmenu"
        placement="bottom-start"
    >
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-if="rightClickEmail.code" @click="copyText(rightClickEmail.code)" >
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="fluent-color:clipboard-24" width="20" height="20" />
                <span>{{t('copyCode')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email'].includes(props.type)" @click="emailRead(rightClickEmail.emailId)" >
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="fluent:mail-read-20-regular" width="20" height="20" />
                <span>{{t('markAsRead')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','star'].includes(props.type)" @click="openReply(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="la:reply" width="20" height="20"  />
                <span>{{t('reply')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','send', 'star'].includes(props.type)" @click="openForward(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:arrow-up-right" width="19" height="19"  />
                <span>{{t('forward')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','send', 'star'].includes(props.type)" @click="starChange(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="solar:star-line-duotone" width="19" height="19"/>
                <span>{{t('star')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email'" @click="handleSearch('user', rightClickEmail.userEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchUser')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email' " @click="handleSearch('account', rightClickEmail.toEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchEmail')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email' " @click="handleSearch('name', rightClickEmail.name)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchSender')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item @click="rightDelete(rightClickEmail.emailId)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="uiw:delete" width="16" height="20" style="margin-left: 1px;margin-right: 3px" />
                <span>{{t('delete')}}</span>
              </div>
            </template>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import skeletonBlock from "@/components/email-scroll/skeleton/index.vue"
import {computed, onActivated, onDeactivated, reactive, ref, watch, nextTick, onUnmounted } from "vue";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {hasPerm} from "@/perm/perm.js";
import {fromNow} from "@/utils/day.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import { UseVirtualList } from '@vueuse/components'
import { useScroll, useMediaQuery, useEventListener, useIntervalFn, useResizeObserver } from '@vueuse/core'
import { emailHtmlToText } from '@/utils/email-html.js'

const props = defineProps({
  getEmailList: Function,
  emailDelete: Function,
  emailRead: Function,
  starAdd: Function,
  starCancel: Function,
  cancelSuccess: Function,
  starSuccess: Function,
  actionLeft: {
    type: String,
    default: '0'
  },
  timeSort: {
    type: Number,
    default: 0,
  },
  showStatus: {
    type: Boolean,
    default: false
  },
  showAccountIcon: {
    type: Boolean,
    default: true,
  },
  showUserInfo: {
    type: Boolean,
    default: false
  },
  showStar: {
    type: Boolean,
    default: true
  },
  allowStar: {
    type: Boolean,
    default: true
  },
  type: {
    type: String,
    default: 'email'
  },
  showFirstLoading: {
    type: Boolean,
    default: true
  },
  showUnread: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['jump', 'refresh-before', 'delete-draft', 'right-search'])
const {t} = useI18n()
const settingStore = useSettingStore()
const accountStore = useAccountStore()
const uiStore = useUiStore();
const emailStore = useEmailStore();
const loading = ref(false);
const followLoading = ref(false);
const noLoading = ref(false);
const emailList = reactive([])
const expandList = reactive([])
const total = ref(0);
const checkAll = ref(false);
const isIndeterminate = ref(false);
const scroll = ref(null)
const firstLoad = ref(true)
let scrollTop = 0
const latestEmail = ref(null)
const scrollbarRef = ref(null)
let listRequest = null
const isMobile = useMediaQuery('(max-width: 1366px)')
const loadError = ref(false)
let disposed = false
let skeletonRows = 0
const timePaddingRight = ref('');
const keyCount = ref(0);
const dropdownRef = ref(null);
const dropdownCloseLock = ref(false);
const dropdownShow = ref(false);
const rightClickEmail = ref({});
const checkedEmailCount = ref(0);
const position = ref(
    DOMRect.fromRect({
      x: 0,
      y: 0,
    })
)

const triggerRef = ref({
  getBoundingClientRect() {
    return position.value;
  }
})

const queryParam = reactive({
  size: 50
});

defineExpose({
  refreshList,
  deleteEmail,
  addItem,
  handleList,
  emailList,
  firstLoad,
  latestEmail,
  noLoading,
  total
})

const { pause: pauseTimeUpdates, resume: resumeTimeUpdates } = useIntervalFn(updateTimes, 60 * 1000)

onActivated(() => {
  updateTimes()
  resumeTimeUpdates()
  requestAnimationFrame(() => {
    const index = scrollTop / itemHeight.value
    scrollbarRef.value?.scrollTo(index);
  })
})

onDeactivated(pauseTimeUpdates)

onUnmounted(() => {
  disposed = true
  listRequest?.abort()
})

getEmailList()

function updateTimes() {
  emailList.forEach(email => {
    email.formatCreateTime = fromNow(email.createTime);
  })
}

function onScroll(e) {
  scrollTop = e.target.scrollTop;
}

const virtualContainer = computed(() => scrollbarRef.value?.$el)
const { arrivedState, measure: measureScroll } = useScroll(virtualContainer, {
  offset: { bottom: 1200 }
})


const list = computed(() => {
  return [...emailList, ...expandList]
})

const itemHeight = computed(() => {
    if (props.type === 'all-email') {
      return isMobile.value ? 132 : 65;
    } else  {
      return isMobile.value ? 83 : 48;
    }
})

watch(() => emailList.length, updateHasScrollbar, { flush: 'post' })

watch(scrollbarRef, updateHasScrollbar, { flush: 'post' })
useResizeObserver(virtualContainer, updateHasScrollbar)

// 强制刷新 (itemHeight 更改后虚拟滚动列表不会自己更新)
watch(itemHeight, async (height, previousHeight) => {
  const index = Math.floor(scrollTop / previousHeight)
  keyCount.value ++
  await nextTick()
  scrollbarRef.value?.scrollTo(index)
})

watch(followLoading, (isFollowLoading) => {
  if (isFollowLoading) {
    expandList.push({
      emailId: 0,
      expand: 'loading'
    })
  } else {
    const index = expandList.findIndex(item => item.expand === 'loading')
    if (index >= 0) expandList.splice(index, 1);
  }
});

watch(noLoading, (isNoLoading) => {
  if (isNoLoading) {
    expandList.push({
      emailId: 0,
      expand: 'noMoreData'
    })
  } else {
    const index = expandList.findIndex(item => item.expand === 'noMoreData')
    if (index >= 0) expandList.splice(index, 1);
  }
})


// 监听是否到达底部
watch(() => arrivedState.bottom, (isBottom) => {
  if (isBottom && !loading.value) {
    loadData();
  }
});

watch(
    () => emailList.map(item => item.checked),
    () => {
      updateCheckStatus();
    }
);


watch(() => emailStore.deleteIds, () => {
  if (emailStore.deleteIds) {
    deleteEmail(emailStore.deleteIds)
  }
})

watch(() => emailStore.cancelStarEmailId, () => {
  emailList.forEach(email => {
    if (email.emailId === emailStore.cancelStarEmailId) {
      email.isStar = 0
    }
  })
})

watch(() => emailStore.addStarEmailId, () => {
  emailList.forEach(email => {
    if (email.emailId === emailStore.addStarEmailId) {
      email.isStar = 1
    }
  })
})

useEventListener(window, 'wheel', () => {
  if (dropdownShow.value) {
    dropdownRef.value?.handleClose();
  }
})

function openReply(email) {
  uiStore.writerRef.openReply(email)
}

function openForward(email) {
  uiStore.writerRef.openForward(email)
}

function visibleChange(e) {
  dropdownShow.value = e;
  dropdownCloseLock.value = true;
  setTimeout(() => {
    dropdownCloseLock.value = false;
  },1500)

  if (!e && rightClickEmail.value.rightChecked) {
    rightClickEmail.value.rightChecked = false
  }
}

const handleContextmenu = (event, email) => {

  if (props.type === 'draft') {
    return
  }

  if (rightClickEmail.value.rightChecked) {
    rightClickEmail.value.rightChecked = false
  }

  const { clientX, clientY } = event
  position.value = DOMRect.fromRect({
    x: clientX,
    y: clientY,
  })
  event.preventDefault();
  dropdownRef.value?.handleOpen();

  rightClickEmail.value = email;
  rightClickEmail.value.rightChecked = true
}

function updateHasScrollbar() {
  nextTick(() => {
    const doc = virtualContainer.value;
    if (doc) {
      if (doc.scrollHeight > doc.clientHeight) {
        timePaddingRight.value = '5px';
      } else {
        timePaddingRight.value = '15px'
      }
    }
  })
}

function getSkeletonRows() {
  if (emailList.length > 20) return skeletonRows = 20
  if (emailList.length === 0) return skeletonRows = 1
  skeletonRows = emailList.length
}

const canSwitchAccount = computed(() => props.showAccountIcon && hasPerm('account:query') && settingStore.settings.manyEmail === 0)
const accountShow = computed(() => canSwitchAccount.value && uiStore.accountShow)
const currentMailboxEmail = computed(() => accountStore.currentAccount?.email || '')
const currentMailboxLabel = computed(() => currentMailboxEmail.value || t('emailAccount'))

function htmlToText(email) {
  if (email.content) {
    return cleanSpace(emailHtmlToText(email.content))
  }

  if (email.text) {
    return cleanSpace(email.text)
  } else {
    return ''
  }

}

function cleanSpace(text) {
  return text
      .replace(/[\u200B-\u200F\uFEFF\u034F\u200B-\u200F\u00A0\u3000\u00AD]/g, '')// 移除零宽空格
      .replace(/\s+/g, ' ')                   // 多空白合并成一个空格
      .trim();
}

async function starChange(email) {
  if (email.starPending || (!email.isStar && !props.allowStar)) return
  const previous = email.isStar
  const request = previous ? props.starCancel : props.starAdd
  if (!request) return
  email.starPending = true
  email.isStar = previous ? 0 : 1
  try {
    await request(email.emailId)
    if (previous) props.cancelSuccess?.(email)
    else props.starSuccess?.(email)
  } catch {
    email.isStar = previous
  } finally {
    email.starPending = false
  }
}

function changeAccountShow() {
  uiStore.accountShow = !uiStore.accountShow;
}

const handleRead = async () => {
  const emailIds = getSelectedMailsIds();
  try {
    await props.emailRead(emailIds);
    localRead(emailIds);
  } catch {}
}

async function emailRead(emailId) {
  try {
    await props.emailRead([emailId])
    localRead([emailId]);
  } catch {}
}

function localRead(emailIds) {
  const ids = new Set(emailIds)
  emailList.forEach(email => {
    if (ids.has(email.emailId)) {
      email.unread = EmailUnreadEnum.READ;
      email.checked = false;
    }
  })
}

function rightDelete(emailId) {

  if (props.type === 'all-email') {
    ElMessageBox.confirm(t('delOneEmailConfirm'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    }).then(() => {
      props.emailDelete([emailId]).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true
        })
        emailStore.deleteIds = [emailId];
      })
    })
    return;
  }
  props.emailDelete([emailId]).then(() => {
    ElMessage({
      message: t('delSuccessMsg'),
      type: 'success',
      plain: true
    })
    emailStore.deleteIds = [emailId];
  })
}

function handleSearch(type, value) {
  emit('right-search', type, value);
}

async function copyText(text) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true
    })
  }
}

function handleDelete() {
  ElMessageBox.confirm(t('delEmailsConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {

    if (props.type === 'draft') {
      const draftIds = getSelectedDraftsIds();
      emit('delete-draft', draftIds);
      return;
    }

    const emailIds = getSelectedMailsIds();
    props.emailDelete(emailIds).then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true
      })
      emailStore.deleteIds = emailIds;
    })
  })
}

function deleteEmail(emailIds) {
  const previousCount = emailList.length
  const ids = new Set(emailIds)
  const remaining = emailList.filter(item => !ids.has(item.emailId))
  if (remaining.length !== previousCount) {
    emailList.splice(0, previousCount, ...remaining)
  }
  total.value = Math.max(0, total.value - (previousCount - emailList.length))
  if (emailList.length < queryParam.size && !noLoading.value) {
    getEmailList()
  }
}

function addItem(email) {

  const existIndex = emailList.findIndex(item => item.emailId === email.emailId)

  if (existIndex > -1) {
    return false;
  }

  email.formatText = htmlToText(email);
  email.formatCreateTime = fromNow(email.createTime);

  if (props.timeSort) {
    if (noLoading.value) {
      handleList([email]);
      emailList.push(email);
    }

    if (!latestEmail.value || email.emailId > latestEmail.value.emailId) {
      latestEmail.value = email
    }

    total.value++
    return true;
  }


  const index = emailList.findIndex(item => item.emailId < email.emailId)

  if (index !== -1) {
    handleList([email]);
    emailList.splice(index, 0, email);
  } else {
    if (noLoading.value) {
      handleList([email]);
      emailList.push(email);
    }
  }

  if (!latestEmail.value || email.emailId > latestEmail.value.emailId) {
    latestEmail.value = email
  }

  total.value++
  return true;
}

function handleCheckAllChange(val) {
  emailList.forEach(item => item.checked = val);
  isIndeterminate.value = false;
}

// 获取选中的邮件列表id
function getSelectedMailsIds() {
  return emailList.filter(item => item.checked).map(item => item.emailId);
}

function getSelectedDraftsIds() {
  return emailList.filter(item => item.checked).map(item => item.draftId);
}

function updateCheckStatus() {
  const checkedCount = emailList.filter(item => item.checked).length;
  checkedEmailCount.value = checkedCount;
  checkAll.value = emailList.length > 0 && checkedCount === emailList.length;
  isIndeterminate.value = checkedCount > 0 && checkedCount < emailList.length;
}

function jumpDetails(email) {

  if (dropdownShow.value) {
    dropdownRef.value.handleClose();
    return;
  }

  if (!dropdownCloseLock.value) {
    const sel = window.getSelection();
    if (sel.toString().trim()) {
      return
    }
  }
  emit('jump', email)
}


async function getEmailList(refresh = false) {

  if (disposed) return
  if (!refresh && (listRequest || loading.value || noLoading.value)) return

  // Refresh supersedes pagination or an older mailbox/sort request.
  listRequest?.abort()
  const request = new AbortController()
  listRequest = request
  const isCurrentRequest = () => !disposed && listRequest === request && !request.signal.aborted

  let emailId = emailList.length > 0 ? emailList.at(-1).emailId : 0;

  loadError.value = false

  if (refresh) {
    getSkeletonRows()
    emailList.length = 0
    latestEmail.value = null
    total.value = 0
    noLoading.value = false
    followLoading.value = false
    emailId = 0
    loading.value = true
    scrollTop = 0
  }

  if (emailList.length === 0) {
    loading.value = true
  } else {
    followLoading.value = !refresh;
  }
  try {
    const data = await props.getEmailList(emailId, queryParam.size, request.signal)
    if (!isCurrentRequest()) return
    firstLoad.value = false

    let list = data.list.map(item => ({
      ...item,
      checked: false
    }));


    if (refresh) {
      emailList.length = 0
    }

    latestEmail.value = data.latestEmail

    handleList(list);
    emailList.push(...list);
    noLoading.value = props.type === 'draft' || data.list.length < queryParam.size;
    total.value = data.total ?? emailList.length;
  } catch {
    if (!isCurrentRequest()) return
    loadError.value = true
    firstLoad.value = false
  } finally {
    if (!isCurrentRequest()) return
    loading.value = false
    followLoading.value = false
    await nextTick()
    if (!isCurrentRequest()) return
    listRequest = null
    if (refresh) scrollbarRef.value?.scrollTo(0)
    measureScroll()
    if (!loadError.value && arrivedState.bottom) loadData()
  }
}

function handleList(list) {
  const statusIconMap = {
    0: { icon: 'ic:round-mark-email-read', color: '#51C76B', content: t('received') },
    1: { icon: 'bi:send-arrow-up-fill',  color: '#51C76B', content: t('sent') },
    2: { icon: 'bi:send-check-fill',     color: '#51C76B', content: t('delivered') },
    3: { icon: 'bi:send-x-fill',         color: '#F56C6C', content: t('bounced') },
    8: { icon: 'bi:send-x-fill',         color: '#F56C6C', content: t('bounced') },
    4: { icon: 'bi:send-exclamation-fill', color: '#FBBD08', content: t('complained') },
    5: { icon: 'bi:send-arrow-up-fill',  color: '#FBBD08', content: t('delayed') },
    7: { icon: 'ic:round-mark-email-read', color: '#FBBD08', content: t('noRecipient') },
  };
  list.forEach(email => {
    email.formatText = htmlToText(email)
    email.formatCreateTime = fromNow(email.createTime);

    if (email.isDel) {
      email.isDelContent = t('selectDeleted');
    }
    email.statusIcon = statusIconMap[email.status] || { icon: 'mdi:email-outline', content: t('message') };
  })
}

function refresh() {
  emit('refresh-before')
  refreshList()
}

function refreshList() {
  checkAll.value = false;
  isIndeterminate.value = false;
  getEmailList(true);
}

function loadData() {
  getEmailList()
}

</script>
<style lang="scss" scoped>

.email-container {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  padding: 0;
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  height: 100%;
}

.has-mailbox-header {
  grid-template-rows: auto auto minmax(0, 1fr);
}

.mailbox-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 48px;
  padding: 2px max(8px, env(safe-area-inset-right)) 2px max(8px, env(safe-area-inset-left));
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.mailbox-identity {
  display: flex;
  align-items: center;
  gap: 0;
  min-width: 0;
}

.mailbox-switcher,
.mailbox-current {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 12px;
  min-width: 0;
  max-width: 100%;
  min-height: 44px;
  padding: 0 2px 0 6px;
  color: inherit;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
}

.mailbox-switcher {
  border-radius: 4px;
  cursor: pointer;
  touch-action: manipulation;
}

.mailbox-switcher:hover,
.mailbox-switcher[aria-expanded="true"] {
  background: var(--base-fill);
}

.mailbox-switcher :deep(svg) {
  flex-shrink: 0;
}

.mailbox-address {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.email-count {
  white-space: nowrap;
  font-size: 12px;
  @media (max-width: 480px) { display: none; }
}

.scroll {
  position: relative;
  min-height: 0;
  margin: 0;
  height: 100%;
  overflow: hidden;

  .virtual { overscroll-behavior: contain; }

  .empty {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
  }

  .noLoading {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 15px 0 0 0;
    color: var(--secondary-text-color);
  }

  .follow-loading {
    height: 60px;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    background: var(--loadding-background);
    height: 100%;
    width: 100%;
    position: absolute;
    z-index: 1;
    top: 0;
    left: 0;
  }

  .loading-show {
    transition: all 200ms ease 200ms;
    opacity: 1;
  }

  .loading-hide {
    pointer-events: none;
    transition: var(--loading-hide-transition);
    opacity: 0;
  }
}

:deep(.email-row) {
  display: flex;
  padding: 8px 0;
  justify-content: space-between;
  box-shadow: var(--header-actions-border);
  cursor: pointer;
  align-items: center;
  position: relative;
  height: 48px;
  @media (max-width: 1366px) {
    height: 83px;
  }

  @media (pointer: coarse) {
    /* 触屏 */
    user-select: none;
  }
  &.all-email {
    height: 65px;
    @media (max-width: 1366px) {
      height: 132px;
    }
  }
  .user-info {
    display: flex;
    flex-wrap: wrap;
    column-gap: 10px;
    margin-top: 5px;
    margin-bottom: 2px;
    color: var(--email-scroll-content-color);
    @media (max-width: 1366px) {
      flex-direction: column;
    }

    .user, .account {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      transition: all 300ms;
      line-height: 12px;
      max-width: 300px;
      min-width: 0;

      @media (max-width: 1223px) {
        max-width: 280px;
      }

      span:first-child {
        position: relative;
      }

      span:last-child {
        margin-left: 5px;
        position: relative;
        bottom: 5px;
      }
    }
  }

  .checkbox {
    display: flex;
    flex: 0 0 44px;
    padding: 0;
    height: 44px;
    justify-content: center;
  }

  .all-email-checkbox {
    display: flex;
    flex: 0 0 44px;
    padding: 0;
    height: 44px;
    justify-content: center;
    @media (min-width: 1367px) {
      justify-content: start;
      height: 100%;
      align-self: start;
      padding-bottom: 30px;
    }
  }

  .title-column {
    @media (max-width: 1366px) {
      grid-template-columns: 1fr !important;
      gap: 4px !important;
    }
  }

  .title {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 240px) minmax(0, 1fr);
    @media (max-width: 1366px) {
      padding-right: 15px;
    }
    @media (max-width: 1366px) {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .email-sender {
      color: var(--el-text-color-primary);
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;

      .email-status {
        display: flex;
        flex-direction: column;
        align-content: center;
        @media (max-width: 1366px) {
          flex-direction: row;
          gap: 5px;
        }
      }

      .name {
        display: grid;
        gap: 5px;
        grid-template-columns: auto 1fr;

        > span:last-child {
          display: flex;
          align-items: center;
        }

        @media (min-width: 1366px) {
          grid-template-columns: 1fr;
          > span:last-child {
            display: none;
          }
        }

        > span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .name-skeleton {
          width: 150px;
          height: 1rem;
          @media (max-width: 767px) {
            width: 130px;
          }
        }
      }

      .phone-time {
        font-weight: normal;
        font-size: 12px;
        @media (min-width: 1367px) {
          display: none;
        }
      }
    }

    .email-text-skeleton {
      .text-skeleton-one {
        width: 80%;
        height: 16px;
        @media (max-width: 1366px) {
          width: 40%;
        }
        @media (max-width: 767px) {
          width: 70%;
        }
      }

      .text-skeleton-two {
        width: min(300px, 100%);
        height: 16px;
        @media (min-width: 1367px) {
          display: none;
        }
        @media (max-width: 1366px) {
          width: 100%;
        }
      }
    }

    .email-text {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      @media (max-width: 1366px) {
        grid-template-columns: 1fr;
      }

      .email-subject {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
        white-space: nowrap;
        min-width: 0;
        @media (min-width: 1367px) {
          padding-left: 5px;
        }
      }

      .code-tag {
        flex: 0 0 auto;
        max-width: 170px;
        height: 20px;
        line-height: 20px;
        font-size: 14px;
        color: var(--el-text-color-primary);
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        cursor: pointer;
      }

      .subject-text {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        min-width: 0;
      }

      .email-content {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        padding-left: 10px;
        color: var(--email-scroll-content-color);
        @media (max-width: 1366px) {
          padding-left: 0;
          margin-top: 0;
        }
      }
    }
  }


  .email-right {
    text-align: right;
    font-size: 12px;
    white-space: nowrap;
    display: flex;
    padding-left: 15px;
    align-items: center;
    @media (max-width: 1366px) {
      display: none;
    }
  }

  .email-right-skeleton {
    @media (max-width: 1366px) {
      display: none;
    }
  }

  &:hover {
    background-color: var(--email-hover-background);
    z-index: 0;
  }

  /*&[data-checked="true"] {
    background-color: #c2dbff;
  }*/
}


.phone-star {
  display: none;
}

.pc-star {
  display: flex;
  flex: 0 0 36px;
  width: 36px;
  padding: 0;
}

@media (max-width: 1366px) {
  .pc-star {
    flex-basis: 44px;
    width: 44px;
  }
  .phone-star {
    display: block;
    align-self: end;
    padding-right: 16px;
    padding-top: 8px;
  }
  .star-pd {
    padding-top: 6px !important;
  }
}

.email-time {
  padding-right: v-bind(timePaddingRight);
}

:deep(.el-scrollbar__view) {
  height: 100%;
}

.header-actions {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  box-shadow: var(--header-actions-border);

  .header-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    position: relative;
    min-width: 0;
    column-gap: 4px;
    row-gap: 8px;
    padding-left: 2px;
    color: var(--el-text-color-primary);;
  }

  .header-right {
    display: grid;
    grid-template-columns: auto auto;
    align-items: center;
    height: 100%;
    color: var(--el-text-color-primary);;

  }

  .icon {
    font-size: 18px;
    cursor: pointer;
  }

  .more-icon {
    margin-top: 8px;
    margin-left: 15px;
  }
}

.load-error {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: var(--el-bg-color);
}

.del-status {
  color: var(--el-color-info);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  bottom: 1px;
}



.right-dropdown-item {
  display: flex;
  gap: 10px;
}

:deep(.el-dropdown-menu__item:last-child) {
  padding-bottom: 10px;
}

:deep(.el-dropdown-menu__item:first-child) {
  padding-top: 10px;
}

:deep(.el-dropdown-menu__item) {
  padding-right: 14px;
  padding-left: 14px;
}

.unread {
  height: 6px;
  width: 6px;
  background: var(--el-color-primary);
  margin-bottom: 2px;
  margin-right: 5px;
  border-radius: 50%;
  display: inline-block;
  justify-content: center;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

</style>
