<template>
    <div class="logo-wrapper">
    <img 
        :class="logoClasses"
        :alt="alt" 
        :src="logoUrl"
    />
  </div>
</template>

<script>
import { mapGetters } from 'vuex'

export default {
  name: 'Logo',
  props: {
    // 图片alt文本
    alt: {
      type: String,
      default: 'Wenying logo'
    },
    // 自定义logo图片URL（可选）
    customSrc: {
      type: String,
      default: ''
    },
    // Logo位置样式
    position: {
      type: String,
      default: 'fixed', // fixed, relative, absolute
      validator: value => ['fixed', 'relative', 'absolute', 'static'].includes(value)
    },
    // Logo大小
    size: {
      type: String,
      default: 'normal', // small, normal, large
      validator: value => ['small', 'normal', 'large'].includes(value)
    },
    // 是否启用悬停动画
    enableHover: {
      type: Boolean,
      default: true
    }
  },
  computed: {
    ...mapGetters(['userConfig']),
    logoUrl() {
      // 优先级：customSrc > 用户配置 > 默认图片
      return this.customSrc || 
             this.userConfig?.logoUrl || 
             require('../assets/logo.png')
    },
    logoClasses() {
      return {
        'logo': true,
        [`logo--${this.position}`]: true,
        [`logo--${this.size}`]: true,
        'logo--hover-enabled': this.enableHover
      }
    }
  }
}
</script>

<style scoped>
.logo-wrapper {
  display: inline-block;
}

.logo {
  --logo-brightness: 1;
  --logo-hover-brightness: 1.08;
  transition: transform 0.3s ease, filter 0.3s ease, opacity 0.3s ease;
  border-radius: 8px;
}

/* 位置样式 */
.logo--fixed {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 100;
}

.logo--relative {
  position: relative;
}

.logo--absolute {
  position: absolute;
  top: 5px;
  left: 5px;
  z-index: 100;
}

.logo--static {
  position: static;
}

/* 大小样式 */
.logo--small {
  height: 50px;
  width: 50px;
}

.logo--normal {
  height: 70px;
  width: 70px;
}

.logo--large {
  height: 90px;
  width: 90px;
}

/* 悬停动画 */
.logo--hover-enabled:hover {
  transform: scale(1.1) rotate(5deg);
  filter: brightness(var(--logo-hover-brightness)) drop-shadow(0 0 10px var(--logo-glow-color));
}

/* 响应式设计 */
@media (max-width: 768px) {
  .logo--small {
    height: 40px;
    width: 40px;
  }
  
  .logo--normal {
    height: 60px;
    width: 60px;
  }
  
  .logo--large {
    height: 75px;
    width: 75px;
  }
}

/* 辅助功能支持 */
.logo:focus {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

/* 主题适配 */
.logo {
  filter: var(--logo-filter, brightness(var(--logo-brightness)) drop-shadow(0 0 0 var(--logo-glow-color)));
  opacity: var(--logo-opacity, 1);
}

/* 暗色模式下的 Logo 样式 */
:global(html.dark) .logo {
  --logo-brightness: 0.9;
  --logo-hover-brightness: 1;
  filter: var(--logo-dark-filter, brightness(var(--logo-brightness)) drop-shadow(0 0 0 var(--logo-glow-color)));
}
</style>
