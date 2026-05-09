export default function Footer({ collapsed }) {
  const year = new Date().getFullYear();
  return (
    <footer className={`main-footer${collapsed ? ' sidebar-collapsed' : ''}`} id="footer">
      &copy; {year} – <strong>Quản lý Bán trú</strong> 🚀 Designed by <strong>Duy Khoa</strong>
    </footer>
  );
}
