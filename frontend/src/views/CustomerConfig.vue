<template>
    <div class="container">
        <el-header>
            <div class="header-content admin-header-content">
                <DashboardTabs activeTab="customerConfig"></DashboardTabs>
                <div class="header-action">
                    <el-tooltip :disabled="disableTooltip" :content="$t('sysConfig.logout')" placement="bottom">
                        <font-awesome-icon icon="sign-out-alt" class="header-icon" @click="handleLogout"></font-awesome-icon>
                    </el-tooltip>
                </div>
            </div>
        </el-header>
        <div class="main-container">
            <section class="source-intro">
                <div><span class="section-eyebrow">UPLOAD SOURCES</span><h1>用户与上传管理</h1><p>按上传 IP 查看文件分布，管理来源的上传权限。</p></div>
                <el-button @click="refreshSources" :loading="loading">刷新数据</el-button>
            </section>
            <section class="source-metrics" aria-label="上传统计">
                <article><span>上传来源</span><strong>{{ summary.totalSources.toLocaleString() }}</strong><small>按 IP 归组</small></article>
                <article><span>当前文件</span><strong>{{ summary.totalFiles.toLocaleString() }}</strong><small>已删除文件不计入</small></article>
                <article><span>允许上传</span><strong>{{ dealedData.filter(row => row.enable).length }}</strong><small>当前来源的上传权限</small></article>
                <article><span>禁止上传</span><strong>{{ blockipList.length }}</strong><small>已设置限制的 IP</small></article>
            </section>
            <div class="source-toolbar">
                <el-input v-model="search" clearable placeholder="搜索 IP 或地址" aria-label="搜索上传来源" />
                <el-select v-model="permissionFilter" aria-label="上传权限筛选"><el-option label="全部权限" value="all" /><el-option label="允许上传" value="allowed" /><el-option label="禁止上传" value="blocked" /></el-select>
                <span>{{ filteredData.length }} 个匹配来源</span>
            </div>
            <p class="storage-note">容量根据当前文件记录统计，不含缩略图、备份副本及存储平台其他文件。<span v-if="summary.unknownSizeFiles"> {{ summary.unknownSizeFiles }} 个文件缺少容量信息。</span></p>
            <el-table :data="paginatedData" :default-sort="{ prop: 'count', order: 'descending' }" @sort-change="handleSort" row-key="ip" class="main-table" table-layout="fixed" v-loading="loading" @expand-change="handleExpandChange">
                <el-table-column type="expand" width="48">
                    <template v-slot="props">
                        <div style="margin: 8px;">
                            <h3 style="text-align: center;">{{ $t('customerConfig.uploadFileList') }}</h3>
                            <el-table :data="props.row.data" style="width: 100%" :default-sort="{ prop: 'metadata.TimeStamp', order: 'descending' }" table-layout="fixed" :max-height="400" v-loading="props.row.filesLoading">
                                <el-table-column prop="metadata.FileName" :label="$t('customerConfig.fileNameCol')"></el-table-column>
                                <el-table-column :label="$t('customerConfig.filePreview')">
                                    <template v-slot="{ row }">
                                        <el-image v-if="isImage(row)" :src="'/file/' + row.id.split('/').map(encodeURIComponent).join('/') + '?from=admin&display=thumbnail'" fit="cover" lazy style="width: 100px; height: 100px;"></el-image>
                                        <video v-else-if="isVideo(row)" :src="'/file/' + row.id.split('/').map(encodeURIComponent).join('/') + '?from=admin'" controls preload="none" style="width: 100px; height: 100px;"></video>
                                        <div v-else style="width: 100px; height: 100px; display: flex; justify-content: center; align-items: center;">
                                            <font-awesome-icon icon="file" style="font-size: 2em;"></font-awesome-icon>
                                        </div>
                                    </template>
                                </el-table-column>
                                <el-table-column 
                                    :formatter="formatTimeStamp" 
                                    :label="$t('customerConfig.uploadTimeCol')" 
                                    prop="metadata.TimeStamp"
                                    sortable 
                                    :sort-method="sortByTimestamp">
                                    <template v-slot="{ row }">
                                        {{ formatTimeStamp(row.metadata.TimeStamp) }}
                                    </template>
                                </el-table-column>
                            </el-table>
                            <div class="source-files-footer"><span>已显示 {{ props.row.data.length }} / {{ props.row.fileTotal || 0 }} 个文件</span><el-button v-if="props.row.data.length < props.row.fileTotal" @click="loadSourceFiles(props.row)" :loading="props.row.filesLoading">加载更多文件</el-button></div>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column prop="ip" :label="$t('customerConfig.ipAddress')" min-width="180"></el-table-column>
                <el-table-column prop="address" :label="$t('customerConfig.address')" min-width="220"></el-table-column>
                <el-table-column prop="count" :label="$t('customerConfig.uploadCount')" sortable="custom" min-width="110"></el-table-column>
                <el-table-column prop="totalSizeMB" label="文件容量" sortable="custom" min-width="130"><template #default="{row}"><span class="capacity-value">{{ formatSize(row.totalSizeMB) }}</span></template></el-table-column>
                <el-table-column prop="lastUpload" label="最近上传" sortable="custom" min-width="175"><template #default="{row}">{{ formatTimeStamp(row.lastUpload) }}</template></el-table-column>
                <el-table-column :label="$t('customerConfig.allowUpload')" :fixed="allowUploadColumnFixed" :width="allowUploadColumnWidth" align="center">
                    <template v-slot="{ row }">
                        <el-switch
                            class="allow-upload-switch"
                            v-model="row.enable" :loading="row.saving" :disabled="row.saving"
                            :active-text="$t('customerConfig.allow')"
                            :inactive-text="$t('customerConfig.deny')"
                            @change="handleSwitchEnable(row)"
                        >
                        </el-switch>
                    </template>
                </el-table-column>
            </el-table>

            <!-- 分页组件 -->
            <div class="pagination-container">
                <div class="pagination-center">
                    <el-pagination
                        background
                        layout="prev, pager, next"
                        :total="filteredData.length"
                        :current-page="currentPage"
                        :page-size="pageSize"
                        :pager-count="pagerCount"
                        @current-change="handlePageChange"
                    ></el-pagination>
                    <el-button v-if="hasMore" type="primary" @click="loadMoreData" :loading="loading" class="load-more">{{ $t('customerConfig.loadMore') }}</el-button>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import fetchWithAuth from '@/utils/fetchWithAuth';
import DashboardTabs from '@/components/DashboardTabs.vue';
import backgroundManager from '@/mixins/backgroundManager';
export default {
    name:'CustomerConfig', components:{DashboardTabs}, mixins:[backgroundManager],
    data(){return {dealedData:[],blockipList:[],loading:false,viewportWidth:window.innerWidth,currentPage:1,pageSize:10,search:'',permissionFilter:'all',sortProp:'count',sortOrder:'descending',hasMore:false,summary:{totalSources:0,totalFiles:0,totalSizeMB:0,unknownSizeFiles:0}}},
    computed:{
        isMobile(){return this.viewportWidth<768},disableTooltip(){return this.isMobile},pagerCount(){return this.isMobile?3:7},allowUploadColumnFixed(){return this.isMobile?'right':false},allowUploadColumnWidth(){return this.isMobile?96:170},
        filteredData(){const term=this.search.trim().toLowerCase();return this.dealedData.filter(r=>(!term||r.ip.toLowerCase().includes(term)||r.address.toLowerCase().includes(term))&&(this.permissionFilter==='all'||r.enable===(this.permissionFilter==='allowed'))).slice().sort((a,b)=>{const d=(Number(a[this.sortProp])||0)-(Number(b[this.sortProp])||0);return this.sortOrder==='ascending'?d:-d})},
        paginatedData(){return this.filteredData.slice((this.currentPage-1)*this.pageSize,this.currentPage*this.pageSize)}
    },
    watch:{search(){this.currentPage=1},permissionFilter(){this.currentPage=1}},
    methods:{
        isImage(row){return row.metadata?.FileType?.toLowerCase().startsWith('image/') || /\.(jpe?g|png|gif|webp|avif|bmp|svg|heic|heif)$/i.test(row.metadata?.FileName || row.id || '')},
        isVideo(row){return row.metadata?.FileType?.toLowerCase().startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(row.metadata?.FileName || row.id || '')},
        formatSize(mb){const n=Math.max(0,Number(mb)||0);return n>=1048576?(n/1048576).toFixed(2)+' TiB':n>=1024?(n/1024).toFixed(2)+' GiB':n.toFixed(2)+' MiB'},
        formatTimeStamp(t){return t?new Date(Number(t)).toLocaleString():'—'},sortByTimestamp(a,b){return (Number(a.metadata?.TimeStamp)||0)-(Number(b.metadata?.TimeStamp)||0)},
        handleSort({prop,order}){this.sortProp=prop||'count';this.sortOrder=order||'descending';this.currentPage=1},handlePageChange(page){this.currentPage=page},handleResize(){this.viewportWidth=window.innerWidth},
        async refreshSources(){if(this.loading)return;this.loading=true;try{
            const [sources,blocked]=await Promise.all([fetchWithAuth('/api/manage/cusConfig/list?count=1000&format=summary',{cache:'no-store'}),fetchWithAuth('/api/manage/cusConfig/blockipList',{cache:'no-store'})]);
            if(!sources.ok||!blocked.ok)throw Error('加载失败');const result=await sources.json();this.blockipList=[...new Set((await blocked.text()).split(',').filter(Boolean))];this.summary={...this.summary,...result.summary};this.hasMore=result.hasMore;
            this.dealedData=result.sources.map(item=>({...item,enable:!this.blockipList.includes(item.ip),saving:false,data:[],filesLoaded:false,filesLoading:false}));this.currentPage=1;
        }catch(e){this.$message.error('用户数据加载失败，请重试')}finally{this.loading=false}},
        async loadMoreData(){if(this.loading)return;this.loading=true;try{const r=await fetchWithAuth('/api/manage/cusConfig/list?count=1000&format=summary&start='+this.dealedData.length,{cache:'no-store'});if(!r.ok)throw Error();const b=await r.json();this.hasMore=b.hasMore;this.dealedData.push(...b.sources.map(item=>({...item,enable:!this.blockipList.includes(item.ip),saving:false,data:[],filesLoaded:false,filesLoading:false})));}catch{this.$message.error('加载失败')}finally{this.loading=false}},
        async handleSwitchEnable(row){row.saving=true;try{const r=await fetchWithAuth('/api/manage/cusConfig/'+(row.enable?'whiteip':'blockip'),{method:'POST',body:row.ip});if(!r.ok)throw Error();this.blockipList=row.enable?this.blockipList.filter(ip=>ip!==row.ip):[...new Set([...this.blockipList,row.ip])];this.$message.success('上传权限已更新')}catch{row.enable=!row.enable;this.$message.error('权限保存失败，已恢复原设置')}finally{row.saving=false}},
        async handleExpandChange(row,expanded){if(!expanded.includes(row)||row.filesLoaded||row.filesLoading)return;await this.loadSourceFiles(row)},
        async loadSourceFiles(row){if(row.filesLoading)return;row.filesLoading=true;try{const r=await fetchWithAuth('/api/manage/cusConfig/files?ip='+encodeURIComponent(row.ip)+'&start='+row.data.length+'&count=20',{cache:'no-store'});if(!r.ok)throw Error();const b=await r.json();row.data.push(...(b.data||[]));row.fileTotal=b.total;row.filesLoaded=true}catch{this.$message.error('文件列表加载失败')}finally{row.filesLoading=false}},
        handleLogout(){const url=process.env.NODE_ENV==='production'?'/api/auth/logout':'/api/api/auth/logout';fetch(url,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({authType:'admin'})}).finally(()=>{this.$store.commit('setAdminLoggedIn',false);this.$router.push('/adminLogin')})}
    },
    mounted(){window.addEventListener('resize',this.handleResize);this.initializeBackground('adminBkImg','.container',false,true);this.refreshSources()},beforeUnmount(){window.removeEventListener('resize',this.handleResize)}
}
</script>

<style scoped src="@/styles/admin-common.css"></style>

<style scoped>
.main-table {
    width: 95%;
    max-width: 1400px;
    border-radius: 16px;
    box-shadow: var(--glass-shadow);
    min-height: 530px;
    overflow: hidden;
    border: 1px solid var(--glass-border);
    background: var(--glass-bg) !important;
    backdrop-filter: blur(20px) saturate(1.4);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
}

.main-table :deep(.el-table__inner-wrapper) {
    background: transparent !important;
}

.main-table :deep(.el-table__header-wrapper) {
    background: var(--glass-header-bg) !important;
}

.main-table :deep(.el-table__header th) {
    background: transparent !important;
}

.main-table :deep(.el-table__body-wrapper) {
    background: transparent !important;
}

.main-table :deep(.el-table__row) {
    background: transparent !important;
}

.main-table :deep(.el-table__row td) {
    background: transparent !important;
}

.main-table :deep(.el-table__row:hover td) {
    background: var(--glass-header-bg) !important;
}

.main-table :deep(.el-table__expanded-cell) {
    background: var(--glass-header-bg) !important;
}

.container {
    background: var(--admin-container-bg-color);
    min-height: 100vh;
    font-family: 'Arial', sans-serif;
    color: var(--admin-container-color);
    margin: 0;
    padding: 0;
}

.main-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 32px;
}

@media (max-width: 768px) {
    .main-container {
        margin-top: 60px;
    }

    .allow-upload-switch :deep(.el-switch__label) {
        display: none;
    }

    .main-table :deep(.el-table-fixed-column--right),
    .main-table :deep(.el-table__fixed-right-patch) {
        background: var(--glass-bg) !important;
        backdrop-filter: blur(20px) saturate(1.4);
        -webkit-backdrop-filter: blur(20px) saturate(1.4);
    }

    .main-table :deep(.el-table__body-wrapper .el-table__row td.el-table-fixed-column--right) {
        background: var(--glass-bg) !important;
        backdrop-filter: blur(20px) saturate(1.4);
        -webkit-backdrop-filter: blur(20px) saturate(1.4);
    }

    .main-table :deep(.el-table__header-wrapper .el-table-fixed-column--right),
    .main-table :deep(.el-table__body-wrapper .el-table__row:hover .el-table-fixed-column--right) {
        background: var(--glass-header-bg) !important;
        backdrop-filter: blur(20px) saturate(1.4);
        -webkit-backdrop-filter: blur(20px) saturate(1.4);
    }
}

</style>

<style scoped>
.source-intro,.source-toolbar,.source-metrics,.storage-note{width:95%;max-width:1400px;box-sizing:border-box}
.source-intro{display:flex;justify-content:space-between;align-items:center;margin:6px auto 24px;gap:18px}
.section-eyebrow{font-size:11px;letter-spacing:2px;color:var(--el-color-primary);font-weight:700}
.source-intro h1{font-size:30px;letter-spacing:-1px;margin:10px 0;color:var(--el-text-color-primary)}
.source-intro p,.storage-note{font-size:13px;color:var(--el-text-color-secondary);line-height:1.7;margin-top:0}
.source-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:0 auto 24px}
.source-metrics article{padding:20px 24px;border:1px solid var(--glass-border);border-radius:16px;background:var(--glass-bg);display:flex;flex-direction:column;gap:9px}
.source-metrics span{font-size:13px;color:var(--el-text-color-secondary)}
.source-metrics strong{font-size:29px;font-variant-numeric:tabular-nums;letter-spacing:-.7px;color:var(--el-text-color-primary)}
.source-metrics small{font-size:12px;color:var(--el-text-color-secondary)}
.source-metrics .storage-metric{border-top:3px solid var(--el-color-primary)}
.source-toolbar{display:flex;align-items:center;gap:12px;margin:0 auto 12px}.source-toolbar .el-input{max-width:340px}.source-toolbar .el-select{width:150px;flex-shrink:0}.source-toolbar span{margin-left:auto;font-size:13px;color:var(--el-text-color-secondary)}
.source-files-footer{display:flex;align-items:center;justify-content:space-between;padding:12px;font-size:12px;color:var(--el-text-color-secondary)}.storage-note{margin:0 auto 18px}.capacity-value{font-variant-numeric:tabular-nums;font-weight:600}.main-table{min-height:0!important}.pagination-container{margin-top:24px}
@media(max-width:768px){.source-metrics{grid-template-columns:repeat(2,1fr);gap:10px}.source-metrics article{padding:16px}.source-metrics strong{font-size:23px}.source-intro h1{font-size:24px}.source-toolbar{flex-wrap:wrap}.source-toolbar .el-input{flex:1;min-width:150px}.source-toolbar span{width:100%;margin:0}.source-intro{align-items:flex-start}.main-table{width:95%!important}}
</style>
