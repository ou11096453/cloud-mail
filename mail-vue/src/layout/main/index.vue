<template>
  <div :class="panelVisible ? 'main-box-show' : 'main-box-hide'">
    <button v-if="panelVisible && isMobile" type="button" class="block-show" :aria-label="$t('close')" @click="uiStore.accountShow = false"></button>
    <account :inert="!panelVisible" :aria-hidden="!panelVisible" :class="panelVisible ? 'show' : 'hide'" />
    <router-view class="main-view" v-slot="{ Component,route }">
      <keep-alive :include="['email','all-email','send','sys-setting','star','user','role','analysis','reg-key','draft']">
        <component :is="Component" :key="route.name"/>
      </keep-alive>
    </router-view>
  </div>
</template>
<script setup>
import account from '@/layout/account/index.vue'
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {computed, onBeforeUnmount, onMounted, watch} from "vue";
import { useRoute } from 'vue-router'
import { hasPerm } from "@/perm/perm.js"
import { useMediaQuery } from '@vueuse/core'

const settingStore = useSettingStore()
const uiStore = useUiStore();
const route = useRoute()
const isMobile = useMediaQuery('(max-width: 767px)')

let elNotification = null

const accountShow = computed(() => {
  return uiStore.accountShow && settingStore.settings.manyEmail === 0
})
const panelVisible = computed(() => accountShow.value && hasPerm('account:query'))

watch(isMobile, mobile => {
  if (['content', 'email', 'send'].includes(route.meta.name)) {
    uiStore.accountShow = !mobile
  }
})

watch(() => uiStore.changeNotice, () => {

  const settings = settingStore.settings

  let data = {
    notice: settings.notice,
    noticeWidth: settings.noticeWidth,
    noticeTitle: settings.noticeTitle,
    noticeContent: settings.noticeContent,
    noticeType: settings.noticeType,
    noticeDuration: settings.noticeDuration,
    noticePosition: settings.noticePosition,
    noticeOffset: settings.noticeOffset
  }

  showNotice(data)
})

watch(() => uiStore.changePreview, () => {
  showNotice(uiStore.previewData)
})

function showNotice(data) {

  if (data.notice === 1) {
    return;
  }

  if (elNotification) {
    elNotification.close()
  }

  const style = document.createElement('style');
  style.innerHTML = `
  .custom-notice.el-notification {
    --el-notification-width: min(${data.noticeWidth}px,calc(100% - 30px)) !important;
  }
  `;

  document.head.appendChild(style);

  elNotification = ElNotification({
    title: data.noticeTitle,
    message: `<div style="width: 100%;height: 100%;">${data.noticeContent}</div>`,
    type: data.noticeType === 'none' ? '' : data.noticeType,
    duration: data.noticeDuration,
    position: data.noticePosition,
    offset: data.noticeOffset,
    dangerouslyUseHTMLString: true,
    customClass: 'custom-notice'
  })
}

onBeforeUnmount(() => {
  elNotification?.close()
})

</script>
<style lang="scss" scoped>

.block-show {
  position: fixed;
  inset: 60px 0 0;
  @media (max-width: 767px) {
    border: 0;
    width: 100%;
    background: #000000;
    opacity: 0.6;
    z-index: 10;
    cursor: pointer;
  }
}

.show {
  min-width: 0;
  transition: transform 150ms ease-out;
  @media (max-width: 767px) {
    position: fixed;
    z-index: 100;
    width: 260px;
    max-width: calc(100vw - 44px);
    top: 60px;
    bottom: 0;
    height: auto;
  }
}

.hide {
  transition: transform 150ms ease-out;
  position: fixed;
  transform: translateX(-100%);
  opacity: 0;
  @media (max-width: 1024px) {
    width: 260px;
    z-index: 100;
  }
}


.main-box-show {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  height: calc(100% - 60px);
  @media (max-width: 767px) {
    grid-template-columns: 1fr;
  }
}

.main-box-hide {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  height: calc(100% - 60px);
}


.main-view {
  background: var(--el-bg-color);
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

@media (prefers-reduced-motion: reduce) {
  .show,
  .hide {
    transition: none;
  }
}


.navigation {
  height: 30px;
  border-bottom: solid 1px var(--el-menu-border-color);
  display: inline-flex;
  justify-items: center;
  align-items: center;
  width: 100%;
  .tag {
    background: var(--el-bg-color);
    margin-left: 5px;
  }
}
</style>
