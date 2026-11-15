<template>
  <el-container class="layout">
    <el-aside
        class="aside"
        :inert="!uiStore.asideShow"
        :aria-hidden="!uiStore.asideShow"
        :class="uiStore.asideShow ? 'aside-show' : 'el-aside-hide'">
      <Aside />
    </el-aside>
    <button
        v-if="uiStore.asideShow && isMobile"
        type="button"
        class="overlay-show"
        :aria-label="$t('close')"
        @click="uiStore.asideShow = false"
    ></button>
    <el-container class="main-container">
      <el-main>
        <el-header>
            <Header />
        </el-header>
        <Main />
      </el-main>
    </el-container>
  </el-container>
  <writer ref="writerRef" />
</template>

<script setup>
import Aside from '@/layout/aside/index.vue'
import Header from '@/layout/header/index.vue'
import Main from '@/layout/main/index.vue'
import { ref, onMounted, watch } from 'vue'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import {useUiStore} from "@/store/ui.js";
import writer from '@/layout/write/index.vue'

const uiStore = useUiStore();
const writerRef = ref({})
const isMobile = useMediaQuery('(max-width: 1024px)')
watch(isMobile, mobile => {
  uiStore.asideShow = !mobile
}, { immediate: true })

useEventListener(window, 'keydown', event => {
  if (event.key === 'Escape' && isMobile.value) {
    uiStore.asideShow = false
  }
})

onMounted(() => {
  uiStore.writerRef = writerRef

})
</script>

<style lang="scss" scoped>
.el-aside-hide {
  position: fixed;
  left: 0;
  height: 100%;
  z-index: 100;
  transform: translateX(-100%);
  transition: transform 150ms ease-out;
}

.aside-show {
  -webkit-box-shadow: var(--aside-right-border);
  box-shadow: var(--aside-right-border);
  transform: translateX(0);
  transition: transform 150ms ease-out;
  z-index: 101;
  @media (max-width: 1024px) {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 101;
    height: 100%;
    background: var(--el-bg-color);
  }
}

.el-aside {
  width: auto;
  flex-shrink: 0;
}

.layout {
  height: 100%;
  position: fixed;
  width: 100%;
  top: 0;
  left: 0;
  overflow: hidden;
  height: 100dvh;
}

.main-container {
  min-width: 0;
  height: 100%;
  background: var(--el-bg-color);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.el-main {
  padding: 0;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.el-header {
  background: var(--el-bg-color);
  border-bottom: solid 1px var(--el-border-color);
  padding: 0 0 0 0;
}

.overlay-show {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  z-index: 99;
  cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
  .aside-show,
  .el-aside-hide {
    transition: none;
  }
}
</style>
