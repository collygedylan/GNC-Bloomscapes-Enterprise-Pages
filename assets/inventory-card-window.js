if (!window.GncCardWindow) {
    const cardWindows = new Set();
    const maximumCards = 50;
    const frameTime = () => window.performance?.now?.() ?? Date.now();

    class CardBandHeights {
        constructor(count, estimate) {
            this.count = count;
            this.values = new Float64Array(count).fill(estimate);
            this.tree = new Float64Array(count + 1);
            for (let i=1; i<=count; i++) this.tree[i] = estimate * (i & -i);
        }
        sum(end) {
            let result = 0;
            for (let i=end; i>0; i-=i & -i) result += this.tree[i];
            return result;
        }
        set(index,value) {
            const delta = value-this.values[index];
            if (Math.abs(delta)<0.5) return false;
            this.values[index] = value;
            for (let i=index+1; i<=this.count; i+=i & -i) this.tree[i] += delta;
            return true;
        }
        at(offset) {
            let index = 0, sum = 0, bit = 1;
            while (bit*2<=this.count) bit *= 2;
            for (; bit; bit>>=1) {
                const next = index+bit;
                if (next<=this.count && sum+this.tree[next]<=offset) {
                    index = next;
                    sum += this.tree[next];
                }
            }
            return Math.min(index,Math.max(0,this.count-1));
        }
    }

    class InventoryCardWindow {
        constructor(container,options,previous) {
            this.container = container;
            this.options = options;
            this.rows = options.rows;
            this.signature = options.signature;
            this.scope = options.scope;
            this.scrollRoot = options.scrollRoot || container;
            this.doc = container.ownerDocument;
            this.nodes = new Map();
            this.pending = new Map();
            this.pinned = new Set();
            this.columns = previous?.columns || 1;
            this.gap = previous?.gap ?? 12;
            this.width = previous?.width || 0;
            this.heights = previous?.rows.length === this.rows.length ? previous.heights : this.newHeights();
            this.start = this.end = this.desiredStart = this.desiredEnd = 0;
            this.frame = this.baseOffset = this.contentOffset = this.prefixHeight = 0;
            this.lastFrameMs = this.maxFrameMs = 0;
            this.internalScroll = NaN;
            this.disposed = this.needsReset = this.stickBottom = false;
            this.measuring = true;
            this.template = this.doc.createElement('template');
            this.initialPosition = container.style.position;
            this.initialOverflowAnchor = container.style.overflowAnchor;
            this.onScroll = () => this.handleScroll();
            this.onFocusOut = () => this.refresh();
            this.onFrame = () => this.update();
            this.resize = window.ResizeObserver && new window.ResizeObserver(entries => this.handleResize(entries));
        }

        newHeights() {
            return new CardBandHeights(Math.ceil(this.rows.length/this.columns),Math.max(48,Number(this.options.estimatedHeight)||320)+this.gap);
        }

        mount() {
            const {container,options,rows} = this;
            container.__gncCardWindow = this;
            cardWindows.add(this);
            if (window.getComputedStyle(container).position === 'static') container.style.position = 'relative';
            this.top = this.spacer('before');
            this.bottom = this.spacer('after');
            this.prefix = this.accessory(options.prefixHtml,'prefix');
            const footer = this.accessory(options.footerHtml,'footer');
            const estimate = Math.max(48,Number(options.estimatedHeight)||320)+this.gap;
            const firstIndex = Math.min(rows.length-1,Math.max(0,Math.floor(this.scrollRoot.scrollTop/estimate)*this.columns));
            const limit = Math.min(maximumCards, Math.max(1, options.progressive ? 1 : Number(options.initialRows) || 1));
            this.start = Math.max(0, Math.min(firstIndex, rows.length - limit));
            this.end = Math.min(rows.length, this.start + limit);
            for (let index = this.start; index < this.end; index++) this.nodes.set(index, this.makeNode(index));
            container.replaceChildren(...[this.prefix,this.top,...this.nodes.values(),this.bottom,footer].filter(Boolean));
            container.style.overflowAnchor = 'none';
            this.setSpacers();
            this.nodes.forEach((node,index) => this.observeMounted(node,index));
            this.resize?.observe(container);
            this.scrollRoot.addEventListener('scroll',this.onScroll,{passive:true});
            container.addEventListener('focusout',this.onFocusOut,{passive:true});
            this.refresh();
            return this;
        }

        spacer(kind) {
            const node = this.doc.createElement('div');
            node.dataset.cardWindowSpacer = kind;
            node.setAttribute('aria-hidden','true');
            node.style.cssText = 'grid-column:1 / -1;pointer-events:none;padding:0;margin:0;min-height:0;';
            return node;
        }

        accessory(html,kind) {
            if (!html) return null;
            const node = this.doc.createElement('div');
            node.dataset.cardWindowAccessory = kind;
            node.style.gridColumn = '1 / -1';
            node.innerHTML = html;
            return node;
        }

        valid() {
            return !this.disposed && this.container.__gncCardWindow===this && this.container.isConnected
                && (!this.options.isCurrent || this.options.isCurrent());
        }

        refresh(invalidate=false) {
            if (this.disposed) return;
            if (invalidate) this.needsReset = this.measuring = true;
            if (!this.frame && this.valid()) this.frame = window.requestAnimationFrame(this.onFrame);
        }

        setScroll(value) {
            this.scrollRoot.scrollTop = value;
            this.internalScroll = this.scrollRoot.scrollTop;
        }

        isAtBottom() {
            const {scrollTop,scrollHeight,clientHeight} = this.scrollRoot;
            return scrollTop>0 && scrollHeight-clientHeight-scrollTop<=2;
        }

        handleScroll() {
            if (!Number.isFinite(this.internalScroll) || Math.abs(this.scrollRoot.scrollTop-this.internalScroll)>1) this.stickBottom=this.isAtBottom();
            this.refresh();
        }

        handleResize(entries) {
            if (!this.valid()) return;
            if (entries.some(entry => entry.target!==this.container || entry.contentRect.width!==this.width)) {
                this.measuring = true;
                this.refresh();
            }
        }

        gridColumns(width) {
            if (this.clampedGrid && (this.needsReset || width!==this.width)) this.restoreGrid();
            const style = window.getComputedStyle(this.container);
            const columns = style.display === 'grid' ? Math.max(1,style.gridTemplateColumns.split(/\s+/).filter(v=>v && v!=='none').length) : 1;
            if (columns<maximumCards) return columns;
            const css = this.container.style;
            this.clampedGrid = [css.gridTemplateColumns,css.getPropertyPriority('grid-template-columns')];
            css.setProperty('grid-template-columns','repeat('+(maximumCards-1)+',minmax(0,1fr))','important');
            return maximumCards-1;
        }

        restoreGrid() {
            if (!this.clampedGrid) return;
            this.container.style.setProperty('grid-template-columns',...this.clampedGrid);
            this.clampedGrid = null;
        }

        geometry() {
            const width = this.container.clientWidth;
            const columns = this.gridColumns(width);
            const style = window.getComputedStyle(this.container);
            const gap = parseFloat(style.rowGap)||0;
            const band = this.heights.at(Math.max(0,this.scrollRoot.scrollTop-this.baseOffset));
            const anchor = band*this.columns, offset = this.scrollRoot.scrollTop-this.baseOffset-this.heights.sum(band);
            const changed = this.needsReset || columns!==this.columns || width!==this.width || gap!==this.gap;
            if (changed) {
                Object.assign(this,{columns,width,gap,measuring:true,needsReset:false});
                this.heights = this.newHeights();
            }
            this.prefixHeight = this.prefix ? this.prefix.getBoundingClientRect().height+gap : 0;
            this.contentOffset = (parseFloat(style.paddingTop)||0)+this.prefixHeight;
            this.baseOffset = this.contentOffset;
            if (this.scrollRoot!==this.container) {
                this.baseOffset += this.container.getBoundingClientRect().top-this.scrollRoot.getBoundingClientRect().top+this.scrollRoot.scrollTop;
            }
            if (changed && anchor>0) {
                this.start = Math.floor(anchor/columns)*columns;
                this.end = Math.min(this.rows.length,this.start+columns);
                this.setSpacers();
                this.setScroll(this.stickBottom ? this.scrollRoot.scrollHeight : this.baseOffset+this.heights.sum(Math.floor(anchor/columns))+Math.max(0,offset));
            }
        }

        setSpacers() {
            const before = this.heights.sum(Math.floor(this.start/this.columns));
            const after = this.heights.sum(this.heights.count)-this.heights.sum(Math.ceil(this.end/this.columns));
            this.top.style.display = before>0 ? '' : 'none';
            this.bottom.style.display = after>0 ? '' : 'none';
            this.top.style.height = Math.max(0,before-this.gap)+'px';
            this.bottom.style.height = Math.max(0,after-this.gap)+'px';
            Object.assign(this.container.dataset,{cardWindowStart:this.start,cardWindowEnd:this.end,cardWindowTotal:this.rows.length});
        }

        measure() {
            if (!this.measuring || !this.nodes.size) return;
            this.measuring = false;
            const measured = new Map();
            for (const [i,node] of this.nodes) {
                if (this.pinned.has(i)) continue;
                const band = Math.floor(i/this.columns), style = window.getComputedStyle(node);
                const height = node.getBoundingClientRect().height+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);
                measured.set(band,Math.max(measured.get(band)||0,height));
            }
            const anchor = this.heights.at(Math.max(0,this.scrollRoot.scrollTop-this.baseOffset));
            const before = this.heights.sum(anchor);
            let changed = false;
            for (const [band,height] of measured) if (height>0 && this.heights.set(band,height+this.gap)) changed = true;
            if (!changed) return;
            this.setSpacers();
            const delta = this.heights.sum(anchor)-before;
            if (this.stickBottom) this.setScroll(this.scrollRoot.scrollHeight);
            else if (Math.abs(delta)>0.5) this.setScroll(this.scrollRoot.scrollTop+delta);
        }

        makeNode(index) {
            this.template.innerHTML = this.options.renderRow(this.rows[index],index);
            let node = this.template.content.firstElementChild;
            if (!node || this.template.content.childElementCount!==1) {
                node = this.doc.createElement('div');
                node.append(this.template.content.cloneNode(true));
            }
            node.dataset.cardWindowIndex = String(index);
            node.style.setProperty('content-visibility','auto','important');
            node.style.setProperty('contain-intrinsic-size','84px','important');
            return node;
        }

        range(limit) {
            const top = Math.max(0,this.scrollRoot.scrollTop-this.baseOffset);
            const viewport = Math.max(1,this.scrollRoot.clientHeight || window.innerHeight || 700);
            const margin = Math.min(1000,Math.max(360,viewport*0.75));
            const bands = Math.max(1,Math.floor(limit/this.columns));
            const firstVisible = this.heights.at(top), lastVisible = this.heights.at(top+viewport);
            const first = this.stickBottom ? Math.max(0,this.heights.count-bands) :
                Math.min(firstVisible,Math.max(this.heights.at(Math.max(0,top-margin)),lastVisible-bands+1));
            const start = first*this.columns;
            const viewportEnd = (this.heights.at(top+viewport+margin)+1)*this.columns;
            const bufferedEnd = Math.max(viewportEnd,start+(this.options.initialRows || 1));
            const end = Math.min(this.rows.length,(first+bands)*this.columns,bufferedEnd,start+limit);
            return {start,end};
        }

        prepareRange(started) {
            let range = this.range(maximumCards);
            const focused = this.doc.activeElement;
            const i = this.container.contains(focused) ? [...this.nodes].find(([,node])=>node.contains(focused))?.[0] : undefined;
            if (i<range.start || i>=range.end) range=this.range(maximumCards-1);
            this.desiredStart = range.start;
            this.desiredEnd = range.end;
            for (const key of this.pending.keys()) if (key<range.start || key>=range.end) this.pending.delete(key);
            for (let index=range.start;index<range.end;index++) {
                if (this.nodes.has(index) || this.pending.has(index)) continue;
                this.pending.set(index,this.makeNode(index));
                if (frameTime()-started<4 || index+1>=range.end) continue;
                if (!this.options.progressive || range.start!==this.start || index<this.end) return false;
                this.desiredEnd=index+1;
                return true;
            }
            return true;
        }

        pin(index,node) {
            this.pinned.add(index);
            const style = window.getComputedStyle(this.container);
            const left = parseFloat(style.paddingLeft)||0, right = parseFloat(style.paddingRight)||0;
            const columnGap = parseFloat(style.columnGap)||this.gap;
            const width = (this.width-left-right-columnGap*(this.columns-1))/this.columns;
            node.style.setProperty('position','absolute','important');
            Object.assign(node.style,{width:width+'px',left:(left+(index%this.columns)*(width+columnGap))+'px',
                top:(this.contentOffset+this.heights.sum(Math.floor(index/this.columns)))+'px'});
        }

        releaseOutside() {
            for (const [index,node] of this.nodes) {
                if (index>=this.start && index<this.end) continue;
                if (node.contains(this.doc.activeElement)) this.pin(index,node);
                else {
                    this.resize?.unobserve(node);
                    this.options.onUnmount?.(node,this.rows[index],index);
                    node.remove();
                    this.nodes.delete(index);
                    this.pinned.delete(index);
                }
            }
        }

        observeMounted(node,index) {
            this.resize?.observe(node);
            this.options.onMount?.(node,this.rows[index],index);
        }

        commitRange() {
            const changed = this.start!==this.desiredStart || this.end!==this.desiredEnd;
            this.start = this.desiredStart;
            this.end = this.desiredEnd;
            this.releaseOutside();
            const added = [];
            let next = this.bottom;
            for (let i=this.end-1;i>=this.start;i--) {
                const node = this.nodes.get(i) || this.pending.get(i);
                if (!this.nodes.has(i)) { this.pending.delete(i); this.nodes.set(i,node); added.push([node,i]); }
                if (this.pinned.delete(i)) for (const key of ['position','width','left','top']) node.style.removeProperty(key);
                if (node.nextSibling!==next && !node.contains(this.doc.activeElement)) this.container.insertBefore(node,next);
                next = node;
            }
            this.setSpacers();
            if (this.stickBottom) this.setScroll(this.scrollRoot.scrollHeight);
            for (const [node,index] of added) this.observeMounted(node,index);
            if (!changed && !added.length) return;
            this.measuring = true;
            this.refresh();
            this.options.onRange?.({start:this.start,end:this.end,total:this.rows.length});
        }

        update() {
            this.frame = 0;
            if (!this.valid()) return;
            const started = frameTime();
            this.stickBottom ||= this.isAtBottom();
            this.geometry();
            this.measure();
            if (this.prepareRange(started)) this.commitRange();
            else this.refresh();
            this.lastFrameMs = frameTime()-started;
            this.maxFrameMs = Math.max(this.maxFrameMs,this.lastFrameMs);
        }

        snapshot() {
            const {rows,columns,gap,heights,width} = this;
            return {rows,columns,gap,heights,width};
        }

        debug() {
            const {columns,gap,start,end,desiredStart,desiredEnd,baseOffset,prefixHeight,frame} = this;
            return {columns,gap,start,end,desiredStart,desiredEnd,baseOffset,prefixHeight,frame,pending:this.pending.size,
                scrollTop:this.scrollRoot.scrollTop,valid:this.valid()};
        }

        lifecycle() {
            if (!this.valid()) {
                window.cancelAnimationFrame(this.frame);
                this.frame = 0;
                this.pending.clear();
                this.resize?.disconnect();
                return;
            }
            this.resize?.observe(this.container);
            this.nodes.forEach(node=>this.resize?.observe(node));
            this.refresh();
        }

        destroy() {
            if (this.disposed) return;
            this.disposed = true;
            this.lifecycle();
            this.scrollRoot.removeEventListener('scroll',this.onScroll);
            this.container.removeEventListener('focusout',this.onFocusOut);
            this.restoreGrid();
            this.container.style.position = this.initialPosition;
            this.container.style.overflowAnchor = this.initialOverflowAnchor;
            this.nodes.forEach((node,i)=>this.options.onUnmount?.(node,this.rows[i],i));
            cardWindows.delete(this);
            if (this.container.__gncCardWindow!==this) return;
            delete this.container.__gncCardWindow;
            for (const key of ['cardWindowStart','cardWindowEnd','cardWindowTotal']) delete this.container.dataset[key];
        }
    }

    function mountCardWindow(container,options) {
        if (!container || !Array.isArray(options?.rows) || typeof options.renderRow!=='function') return null;
        const previous = container.__gncCardWindow;
        if (previous && previous.rows===options.rows && previous.signature===options.signature && !previous.disposed) {
            previous.refresh();
            return previous;
        }
        const snapshot = previous?.snapshot();
        previous?.destroy();
        return new InventoryCardWindow(container,options,snapshot).mount();
    }

    const refreshAll = () => cardWindows.forEach(windowState=>windowState.refresh(true));
    window.addEventListener('resize',refreshAll,{passive:true});
    window.AgMetricLifecycle?.subscribe?.(event=>cardWindows.forEach(state=>event.type==='session' ? state.destroy() : state.lifecycle()));
    window.document?.addEventListener('visibilitychange',()=>cardWindows.forEach(state=>state.lifecycle()),{passive:true});
    window.GncCardWindow = Object.freeze({mount:mountCardWindow,destroy:container=>container?.__gncCardWindow?.destroy(),
        refresh:container=>container?.__gncCardWindow?.refresh(true),refreshAll});
}
