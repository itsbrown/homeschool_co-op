import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from 'wouter';
import { formatDate, formatCurrency } from '@/lib/utils';

// Basic styles for the simple classes list
const styles = {
  container: {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  heading: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '2px solid #e2e8f0',
    backgroundColor: '#f8fafc',
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #e2e8f0',
  },
  button: {
    padding: '8px 16px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginRight: '8px',
  },
  errorMessage: {
    color: 'red',
    marginBottom: '20px',
  },
  loadingMessage: {
    color: '#3b82f6',
    marginBottom: '20px',
  },
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
    backgroundColor: '#22c55e',
    color: 'white',
  },
  draftBadge: {
    backgroundColor: '#94a3b8',
  }
};

// Using the formatDate function from utils.ts

export function SimpleClassesPage() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const [classes, setClasses] = useState([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [error, setError] = useState('');

  // Check if user is admin
  const isAdmin = user && (user.role === 'admin' || user.isAdmin);

  // If not admin, redirect to home
  useEffect(() => {
    if (!isLoading && !isAdmin) {
      setLocation('/');
    }
  }, [isLoading, isAdmin, setLocation]);

  // Fetch classes
  useEffect(() => {
    if (isAdmin) {
      setIsLoadingClasses(true);
      fetch('/api/admin-classes/classes', { credentials: 'include' })
        .then(response => {
          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          console.log('Classes data from API:', data);
          if (Array.isArray(data)) {
            setClasses(data);
          } else if (data.classes && Array.isArray(data.classes)) {
            setClasses(data.classes);
          } else {
            console.error('Unexpected data format:', data);
            setError('Received unexpected data format from server');
          }
        })
        .catch(err => {
          console.error('Error fetching classes:', err);
          setError('Failed to load classes. Please try again.');
        })
        .finally(() => {
          setIsLoadingClasses(false);
        });
    }
  }, [isAdmin]);

  const handleDeleteClass = (id: number) => {
    if (window.confirm('Are you sure you want to delete this class?')) {
      fetch(`/api/admin-classes/classes/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }
          // Refresh classes
          setClasses(classes.filter((c: any) => c.id !== id));
          alert('Class deleted successfully');
        })
        .catch(err => {
          console.error('Error deleting class:', err);
          alert('Failed to delete class');
        });
    }
  };

  if (isLoading || !isAdmin) {
    return <div style={styles.container}>Checking authorization...</div>;
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Classes Management</h1>
      
      <button 
        style={styles.button} 
        onClick={() => setLocation('/admin/classes/new')}
      >
        Create New Class
      </button>
      
      <button 
        style={styles.button} 
        onClick={() => setLocation('/admin/classes/upload')}
      >
        Import Classes (CSV)
      </button>
      
      {error && <div style={styles.errorMessage}>{error}</div>}
      
      {isLoadingClasses ? (
        <div style={styles.loadingMessage}>Loading classes...</div>
      ) : (
        <>
          {classes.length === 0 ? (
            <div>No classes found. Create your first class to get started.</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Class</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Dates</th>
                  <th style={styles.th}>Price</th>
                  <th style={styles.th}>Enrollment</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((classItem: any) => (
                  <tr key={classItem.id}>
                    <td style={styles.td}>
                      <div>
                        <div><strong>{classItem.title}</strong></div>
                        <div style={{fontSize: '12px', color: '#64748b'}}>{classItem.instructorName || 'Unknown Instructor'}</div>
                      </div>
                    </td>
                    <td style={styles.td}>{classItem.category || 'General'}</td>
                    <td style={styles.td}>
                      {classItem.startDate ? formatDate(classItem.startDate) : 'N/A'} - 
                      {classItem.endDate ? formatDate(classItem.endDate) : 'N/A'}
                    </td>
                    <td style={styles.td}>{formatCurrency(classItem.price || 0)}</td>
                    <td style={styles.td}>
                      {classItem.enrollmentCount || 0}/{classItem.maxEnrollment || classItem.capacity || 20}
                    </td>
                    <td style={styles.td}>
                      <span 
                        style={{
                          ...styles.badge,
                          ...(classItem.isPublished || classItem.status === 'published' ? {} : styles.draftBadge)
                        }}
                      >
                        {classItem.isPublished || classItem.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <button
                        style={{...styles.button, backgroundColor: '#0ea5e9'}}
                        onClick={() => setLocation(`/admin/classes/edit/${classItem.id}`)}
                      >
                        Edit
                      </button>
                      <button
                        style={{...styles.button, backgroundColor: '#ef4444'}}
                        onClick={() => handleDeleteClass(classItem.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}