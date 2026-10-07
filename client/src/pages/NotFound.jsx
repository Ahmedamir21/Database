import { Link } from 'react-router-dom';
import { useSession } from '../App.jsx';
import { Empty } from '../components/ui.jsx';

const HOME = { Student: '/dashboard', Instructor: '/teaching', Admin: '/office' };

export default function NotFound() {
  const { user } = useSession();
  return (
    <div className="py-10">
      <Empty
        title="This page does not exist"
        action={<Link className="btn btn-primary" to={user ? HOME[user.role] : '/login'}>Go back to the application</Link>}
      >
        The address in the browser does not belong to any screen of Zewail Desk. Check the menu,
        or use the button below.
      </Empty>
    </div>
  );
}
