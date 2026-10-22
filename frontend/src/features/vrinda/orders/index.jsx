import { useParams } from 'react-router-dom';
import FeaturePlaceholder from '../../../components/shared/FeaturePlaceholder/FeaturePlaceholder.jsx';
export default function OrdersPage({ tracking = false }) {
  const { orderId } = useParams();
  return <FeaturePlaceholder title={tracking ? 'A little closer to your door.' : 'Your past reads, remembered.'} description={tracking ? `Order ${orderId || ''} tracking and status details will be planned here.` : 'Order creation and history will live here after implementation.'} owner="Vrinda" story={tracking ? '#12 · Order status and tracking' : '#9 · Order creation and history'} />;
}
