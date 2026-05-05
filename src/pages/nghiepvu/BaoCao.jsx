import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Chart, ArcElement, BarElement, LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, Filler } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import * as XLSX from 'xlsx';
import api from '../../services/api';
import '../../styles/admin.css';
import './BaoCao.css';

Chart.register(ArcElement, BarElement, LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, Filler);

export default function BaoCao() {
  const [activeTab, setActiveTab] = useState('panel-hs');
  const today = new Date().toISOString().slice(0,10);
  
  // Tab Học Sinh
  const [monthHS, setMonthHS] = useState(today.slice(0,7));
  const [lopFilter, setLopFilter] = useState('');
  const [hsData, setHsData] = useState([]);
  const [loadingHS, setLoadingHS] = useState(true);

  // Tab Giáo viên
  const [monthGV, setMonthGV] = useState(today.slice(0,7));
  const [gvData, setGvData] = useState([]);
  const [giaAn, setGiaAn] = useState(0);
  const [giaNgu, setGiaNgu] = useState(0);
  const [loadingGV, setLoadingGV] = useState(true);

  // Lấy dữ liệu Báo cáo HS
  useEffect(() => {
    const [y, m] = monthHS.split('-');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingHS(true);
    const ctrl = new AbortController();
    api.get(`/api/baocao/diemdanh/?thang=${m}&nam=${y}&lop=${lopFilter}`, { signal: ctrl.signal })
      .then(res => {
        if (res.data?.ok) setHsData(res.data.data || []);
      })
      .catch(err => { if (err?.name !== 'CanceledError') console.error(err); })
      .finally(() => setLoadingHS(false));
    return () => ctrl.abort();
  }, [monthHS, lopFilter]);

  // Lấy dữ liệu Báo cáo GV
  useEffect(() => {
    const [y, m] = monthGV.split('-');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingGV(true);
    const ctrl = new AbortController();
    api.get(`/api/baocao/luong-gv/?thang=${m}&nam=${y}`, { signal: ctrl.signal })
      .then(res => {
        if (res.data?.ok) {
          setGvData(res.data.data || []);
          setGiaAn(res.data.don_gia_an || 0);
          setGiaNgu(res.data.don_gia_ngu || 0);
        }
      })
      .catch(err => { if (err?.name !== 'CanceledError') console.error(err); })
      .finally(() => setLoadingGV(false));
    return () => ctrl.abort();
  }, [monthGV]);

  // ── Tính toán số liệu Học Sinh ──
  const totalHS = hsData.length;
  // (Ví dụ) Nếu so_ngay_co_mat_an == 0 và so_ngay_vang_an == 0 => có thể chưa ăn
  // Giả sử vang = HS có ít nhất 1 buổi vắng, phep = ít nhất 1 buổi phép
  const comAn   = hsData.filter(h => h.so_ngay_co_mat_an > 0 || h.so_ngay_co_mat_ngu > 0).length;
  const vang    = hsData.filter(h => h.so_ngay_vang_an > 0 || h.so_ngay_vang_ngu > 0).length;
  const phep    = hsData.filter(h => h.so_ngay_phep_an > 0 || h.so_ngay_phep_ngu > 0).length;

  const donutData = { 
    labels:['Có mặt (ít nhất 1)','Vắng (ít nhất 1)','Phép (ít nhất 1)'], 
    datasets:[{ data:[comAn,vang,phep], backgroundColor:['#00b894','#e17055','#fdcb6e'], borderWidth:0 }] 
  };
  
  // Khối stats (đơn giản hóa)
  const khoiStats = useMemo(() => {
    const map = {};
    hsData.forEach(h => {
      const k = String(h.lop).substring(0, 2);
      if (!map[k]) map[k] = { k, t:0, va:0, vn:0, p:0 };
      map[k].t++;
      map[k].va += h.so_ngay_vang_an;
      map[k].vn += h.so_ngay_vang_ngu;
      map[k].p += (h.so_ngay_phep_an + h.so_ngay_phep_ngu);
    });
    return Object.values(map).sort((a,b) => a.k.localeCompare(b.k));
  }, [hsData]);

  // Lớp list (cho filter)
  const lopList = useMemo(() => [...new Set(hsData.map(h => h.lop))].sort(), [hsData]);

  // ── Tính toán số liệu Giáo Viên ──
  const totCaAn  = gvData.reduce((a,g) => a + g.so_ca_an, 0);
  const totCaNgu = gvData.reduce((a,g) => a + g.so_ca_ngu, 0);
  const totTien  = gvData.reduce((a,g) => a + g.tong_tien, 0);

  const gvDonut = { labels:['Tổng Ca ăn','Tổng Ca ngủ'], datasets:[{ data:[totCaAn,totCaNgu], backgroundColor:['#fdcb6e','#a29bfe'], borderWidth:0 }] };
  const gvBar   = { 
    labels: gvData.map(g => g.ho_ten.split(' ').pop()), 
    datasets:[
      { label:'Ca ăn', data:gvData.map(g=>g.so_ca_an), backgroundColor:'rgba(253,203,110,.8)', borderRadius:4 },
      { label:'Ca ngủ', data:gvData.map(g=>g.so_ca_ngu), backgroundColor:'rgba(162,155,254,.8)', borderRadius:4 }
    ] 
  };

  // ── EXPORT ──
  const exportHsExcel = () => {
    const rows = [
      ['DANH SÁCH TỔNG HỢP ĐIỂM DANH HỌC SINH'],
      ['Tháng: ' + monthHS], [], 
      ['STT','Họ tên','Lớp','Ngày có mặt(Ăn)','Vắng(Ăn)','Phép(Ăn)','Ngày có mặt(Ngủ)','Vắng(Ngủ)','Phép(Ngủ)'], 
      ...hsData.map((h,i)=>[i+1, h.ho_ten, h.lop, h.so_ngay_co_mat_an, h.so_ngay_vang_an, h.so_ngay_phep_an, h.so_ngay_co_mat_ngu, h.so_ngay_vang_ngu, h.so_ngay_phep_ngu])
    ];
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'HS'); 
    XLSX.writeFile(wb, `baocao-hs-${monthHS}.xlsx`);
  };

  const exportGvExcel = () => {
    const rows = [
      ['BẢNG THỐNG KÊ LƯƠNG GIÁO VIÊN TRỰC BÁN TRÚ'],
      [`Tháng: ${monthGV}  |  Đơn giá ăn: ${giaAn.toLocaleString('vi-VN')}đ  |  Ngủ: ${giaNgu.toLocaleString('vi-VN')}đ`], [], 
      ['STT','Họ tên GV','Số ca ăn','Số ca ngủ','Tổng số ca','Tổng thành tiền (VNĐ)'], 
      ...gvData.map((g,i)=>[i+1, g.ho_ten, g.so_ca_an, g.so_ca_ngu, g.so_ca_an + g.so_ca_ngu, g.tong_tien.toLocaleString('vi-VN')])
    ];
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'GV'); 
    XLSX.writeFile(wb, `baocao-gv-${monthGV}.xlsx`);
  };

  const printPage = () => window.print();

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Thống kê &amp; Báo cáo</span>
          </div>
          <h2><i className="fas fa-chart-bar" style={{color:'var(--primary)',marginRight:8}}></i>Thống kê &amp; Báo cáo</h2>
          <p>Báo cáo chuyên cần học sinh và thống kê lương ca trực giáo viên theo thời gian thực tế.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={printPage}><i className="fas fa-print"></i> In</button>
          <button className="btn btn-success btn-sm" onClick={activeTab==='panel-hs'?exportHsExcel:exportGvExcel}><i className="fas fa-file-excel"></i> Excel</button>
        </div>
      </div>

      {/* MAIN TABS */}
      <div className="bc-main-tabs">
        <button className={`bc-main-tab${activeTab==='panel-hs'?' active':''}`} onClick={()=>setActiveTab('panel-hs')}>
          <i className="fas fa-users"></i> Thống kê Học sinh
        </button>
        <button className={`bc-main-tab${activeTab==='panel-gv'?' active':''}`} onClick={()=>setActiveTab('panel-gv')}>
          <i className="fas fa-chalkboard-teacher"></i> Thống kê Lương Giáo viên
        </button>
      </div>

      {/* PANEL HỌC SINH */}
      {activeTab === 'panel-hs' && (
        <div className="bc-main-panel active">
          {/* Filter bar */}
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14,flexWrap:'wrap'}}>
            <label style={{fontWeight:600}}><i className="fas fa-calendar-alt"></i> Chọn Tháng:</label>
            <input type="month" value={monthHS} onChange={e=>setMonthHS(e.target.value)} style={{padding:'6px 10px',borderRadius:8,border:'1.5px solid #e2e8f0',fontFamily:'inherit'}} />
            <button className="btn btn-outline btn-sm" onClick={()=>setMonthHS(today.slice(0,7))}>Tháng này</button>
          </div>

          <div className="bc-filter-row">
            <div className="bc-filter-item">
              <label><i className="fas fa-chalkboard"></i> Lớp:</label>
              <select value={lopFilter} onChange={e => setLopFilter(e.target.value)}>
                <option value="">Tất cả</option>
                {lopList.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            {loadingHS && <span style={{color:'var(--primary)'}}><i className="fas fa-spinner fa-spin"></i> Đang tải...</span>}
          </div>

          {/* Stat cards */}
          <div className="bc-metrics-grid">
            <div className="stat-card blue"><div className="stat-card-icon"><i className="fas fa-users"></i></div><div className="stat-card-info"><p>Tổng HS</p><h3>{totalHS}</h3><small></small></div></div>
            <div className="stat-card green"><div className="stat-card-icon"><i className="fas fa-check-circle"></i></div><div className="stat-card-info"><p>HS có đi</p><h3>{comAn}</h3></div></div>
            <div className="stat-card red"><div className="stat-card-icon"><i className="fas fa-times-circle"></i></div><div className="stat-card-info"><p>HS có vắng</p><h3>{vang}</h3></div></div>
            <div className="stat-card yellow"><div className="stat-card-icon"><i className="fas fa-file-alt"></i></div><div className="stat-card-info"><p>HS có phép</p><h3>{phep}</h3></div></div>
          </div>

          {/* Charts */}
          <div className="bc-charts-row">
            <div className="bc-chart-card"><div className="bc-chart-title"><i className="fas fa-chart-pie"></i> Tỉ lệ vắng/có mặt trong tháng</div><div className="bc-chart-canvas" style={{height:220,display:'flex',alignItems:'center',justifyContent:'center'}}>{totalHS > 0 ? <Doughnut data={donutData} options={{plugins:{legend:{position:'bottom'}},cutout:'65%'}} /> : <span style={{opacity:0.5}}>Chưa có dữ liệu</span>}</div></div>
            
            {/* Khối cards */}
            <div style={{flex:1, display:'flex', flexDirection:'column', gap:12}}>
              {khoiStats.map(({k,t,va,vn,p})=>{
                return (
                  <div key={k} className="bc-khoi-card" style={{margin:0}}>
                    <div className={`bc-khoi-header k${k}`}><i className="fas fa-school"></i> KHỐI {k}</div>
                    <div className="bc-khoi-body" style={{padding:'8px 12px'}}>
                      <div className="bc-khoi-stat"><span className="bc-khoi-stat-label">Tổng HS</span><span className="bc-khoi-stat-value">{t}</span></div>
                      <div className="bc-khoi-stat"><span className="bc-khoi-stat-label">Tổng lượt vắng (Ăn/Ngủ)</span><span className="bc-khoi-stat-value">{va} / {vn}</span></div>
                      <div className="bc-khoi-stat"><span className="bc-khoi-stat-label">Lượt phép</span><span className="bc-khoi-stat-value">{p}</span></div>
                    </div>
                  </div>
                );
              })}
              {khoiStats.length === 0 && <div className="bc-empty"><i className="fas fa-inbox"></i> Chưa có dữ liệu điểm danh tháng này</div>}
            </div>
          </div>

          {/* Bảng chi tiết HS */}
          <div className="bc-detail-section" style={{marginTop:18}}>
            <div className="bc-detail-header">
              <h3><i className="fas fa-list-alt"></i> Tổng hợp chuyên cần từng học sinh (Tháng {monthHS})</h3>
              <div className="bc-export-btns">
                <button className="btn btn-success btn-sm" onClick={exportHsExcel}><i className="fas fa-file-excel"></i> Xuất Excel</button>
              </div>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="data-table" id="bc-detail-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>#</th><th rowSpan={2}>Họ tên</th><th rowSpan={2}>Lớp</th>
                    <th colSpan={3} style={{textAlign:'center', background:'#fdf8f6'}}>Ca Ăn</th>
                    <th colSpan={3} style={{textAlign:'center', background:'#f8f9fa'}}>Ca Ngủ</th>
                  </tr>
                  <tr>
                    <th style={{background:'#fdf8f6'}}>Có mặt</th><th style={{background:'#fdf8f6'}}>Vắng</th><th style={{background:'#fdf8f6'}}>Phép</th>
                    <th style={{background:'#f8f9fa'}}>Có mặt</th><th style={{background:'#f8f9fa'}}>Vắng</th><th style={{background:'#f8f9fa'}}>Phép</th>
                  </tr>
                </thead>
                <tbody>
                  {hsData.map((h,i)=>(
                    <tr key={h.id}>
                      <td>{i+1}</td><td><b>{h.ho_ten}</b></td><td>{h.lop}</td>
                      <td>{h.so_ngay_co_mat_an}</td>
                      <td><span className={h.so_ngay_vang_an>0?'badge badge-danger':''}>{h.so_ngay_vang_an || '0'}</span></td>
                      <td>{h.so_ngay_phep_an}</td>
                      <td>{h.so_ngay_co_mat_ngu}</td>
                      <td><span className={h.so_ngay_vang_ngu>0?'badge badge-warning':''}>{h.so_ngay_vang_ngu || '0'}</span></td>
                      <td>{h.so_ngay_phep_ngu}</td>
                    </tr>
                  ))}
                  {hsData.length === 0 && <tr><td colSpan={9} style={{textAlign:'center', padding:16, color:'#94a3b8'}}>Không có dữ liệu cho tháng {monthHS}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PANEL GIÁO VIÊN */}
      {activeTab === 'panel-gv' && (
        <div className="bc-main-panel active">
          <div className="bc-filter-row" style={{marginBottom:18}}>
            <div className="bc-filter-item"><label><i className="fas fa-calendar-alt"></i> Tháng:</label><input type="month" value={monthGV} onChange={e=>setMonthGV(e.target.value)} /></div>
            {loadingGV && <span style={{color:'var(--primary)'}}><i className="fas fa-spinner fa-spin"></i> Đang tính lương...</span>}
            <div style={{marginLeft:'auto',display:'flex',gap:8}}>
              <button className="btn btn-success btn-sm" onClick={exportGvExcel}><i className="fas fa-file-excel"></i> Xuất Excel</button>
              <button className="btn btn-ghost btn-sm" onClick={printPage}><i className="fas fa-print"></i> In</button>
            </div>
          </div>

          {/* Stat cards GV */}
          <div className="gv-stat-grid">
            <div className="gv-unit-card"><div className="gv-unit-icon purple"><i className="fas fa-chalkboard-teacher"></i></div><div className="gv-unit-info"><p>Tổng GV tham gia</p><h3>{gvData.length}</h3></div></div>
            <div className="gv-unit-card"><div className="gv-unit-icon blue"><i className="fas fa-calendar-check"></i></div><div className="gv-unit-info"><p>Tổng ca trực (tháng)</p><h3>{totCaAn+totCaNgu}</h3></div></div>
            <div className="gv-unit-card"><div className="gv-unit-icon green"><i className="fas fa-utensils"></i></div><div className="gv-unit-info"><p>Ca ăn / Ca ngủ</p><h3>{totCaAn} / {totCaNgu}</h3></div></div>
            <div className="gv-unit-card"><div className="gv-unit-icon orange"><i className="fas fa-money-bill-wave"></i></div><div className="gv-unit-info"><p>Tổng tiền trực</p><h3>{totTien.toLocaleString('vi-VN')} đ</h3></div></div>
          </div>

          {/* Charts GV */}
          {gvData.length > 0 && (
            <div className="bc-charts-row" style={{marginBottom:18}}>
              <div className="bc-chart-card"><div className="bc-chart-title"><i className="fas fa-chart-pie"></i> Tỷ trọng ca trực</div><div className="bc-chart-canvas" style={{height:220,display:'flex',alignItems:'center',justifyContent:'center'}}><Doughnut data={gvDonut} options={{plugins:{legend:{position:'bottom'}},cutout:'65%'}} /></div></div>
              <div className="bc-chart-card"><div className="bc-chart-title"><i className="fas fa-chart-bar"></i> Số ca trực theo GV</div><div className="bc-chart-canvas"><Bar data={gvBar} options={{responsive:true,scales:{x:{stacked:false},y:{beginAtZero:true}},plugins:{legend:{position:'top'}}}} /></div></div>
            </div>
          )}

          {/* Bảng chi tiết GV */}
          <div className="bc-detail-section">
            <div className="bc-detail-header">
              <h3><i className="fas fa-table"></i> Bảng tính tiền trực theo giáo viên (Tháng {monthGV})</h3>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,background:'#f8fafc',borderRadius:8,padding:'7px 14px'}}>
                  <i className="fas fa-tag" style={{color:'#64748b',fontSize:'.8rem'}}></i>
                  <span style={{fontSize:'.8rem',color:'#64748b'}}>Đơn giá cấu hình:</span>
                  <span className="ca-an-badge" style={{fontSize:'.8rem'}}>🍽️ {giaAn.toLocaleString('vi-VN')}đ/ca</span>
                  <span className="ca-ngu-badge" style={{fontSize:'.8rem'}}>🛏️ {giaNgu.toLocaleString('vi-VN')}đ/ca</span>
                </div>
              </div>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="data-table" id="gv-detail-table">
                <thead><tr><th style={{width:44}}>STT</th><th>Họ tên GV</th><th style={{textAlign:'center'}}>Số ca ăn 🍽️</th><th style={{textAlign:'center'}}>Số ca ngủ 🛏️</th><th style={{textAlign:'right',minWidth:200}}>Thành tiền (VNĐ)</th></tr></thead>
                <tbody>
                  {gvData.map((g,i)=>(
                    <tr key={g.id}>
                      <td style={{textAlign:'center',color:'#64748b',fontWeight:600}}>{i+1}</td>
                      <td><strong>{g.ho_ten}</strong></td>
                      <td style={{textAlign:'center'}}><span className="ca-an-badge">{g.so_ca_an} ca</span></td>
                      <td style={{textAlign:'center'}}><span className="ca-ngu-badge">{g.so_ca_ngu} ca</span></td>
                      <td style={{textAlign:'right'}}>
                        <div style={{fontWeight:800,color:'#00b894',fontSize:'1rem'}}>{g.tong_tien.toLocaleString('vi-VN')}đ</div>
                        <div style={{fontSize:'.74rem',color:'#b7791f'}}>{(g.so_ca_an*giaAn).toLocaleString('vi-VN')}đ ăn</div>
                        <div style={{fontSize:'.74rem',color:'#6c5ce7'}}>{(g.so_ca_ngu*giaNgu).toLocaleString('vi-VN')}đ ngủ</div>
                      </td>
                    </tr>
                  ))}
                  {gvData.length === 0 && <tr><td colSpan={5} style={{textAlign:'center', padding:16, color:'#94a3b8'}}>Không có lịch trực nào đã được xác nhận trong tháng {monthGV}</td></tr>}
                </tbody>
                {gvData.length > 0 && (
                  <tfoot>
                    <tr style={{background:'linear-gradient(90deg,rgba(0,156,255,.06),rgba(108,92,231,.04))'}}>
                      <td colSpan={2} style={{fontWeight:800,fontSize:'.9rem'}}><i className="fas fa-sigma" style={{color:'var(--primary)',marginRight:4}}></i>TỔNG CỘNG</td>
                      <td style={{textAlign:'center'}}><span className="ca-an-badge" style={{fontWeight:800}}>{totCaAn} ca</span></td>
                      <td style={{textAlign:'center'}}><span className="ca-ngu-badge" style={{fontWeight:800}}>{totCaNgu} ca</span></td>
                      <td style={{textAlign:'right',fontWeight:800,color:'#00b894',fontSize:'1.05rem'}}>{totTien.toLocaleString('vi-VN')}đ</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
