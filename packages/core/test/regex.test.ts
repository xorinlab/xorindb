import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, Database } from '../src';

interface Article {
  title: string;
  category: string;
  tags: string[];
  author: {
    username: string;
  };
}

describe('Regex & Pattern Matching Queries', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ name: `test-regex-db-${Date.now()}` });
  });

  it('should match documents with RegExp literal directly', async () => {
    const articles = await db.collection<Article>({ name: 'articles' });

    await articles.insert({
      title: 'Getting Started with XorinDB',
      category: 'database',
      tags: ['js', 'db'],
      author: { username: 'alex99' }
    });

    await articles.insert({
      title: 'Advanced React Patterns',
      category: 'frontend',
      tags: ['react'],
      author: { username: 'john_dev' }
    });

    const xorinArticles = await articles.find({
      title: /xorindb/i
    }).exec();

    expect(xorinArticles.length).toBe(1);
    expect(xorinArticles[0].title).toBe('Getting Started with XorinDB');
  });

  it('should match documents using $regex string and $options flag', async () => {
    const articles = await db.collection<Article>({ name: 'articles' });

    await articles.insert({
      title: 'Node.js vs Bun Comparison',
      category: 'backend',
      tags: ['bun'],
      author: { username: 'sarah_code' }
    });

    await articles.insert({
      title: 'CSS Grid Mastery',
      category: 'frontend',
      tags: ['css'],
      author: { username: 'bob_ui' }
    });

    // Case-insensitive regex string with $options
    const res = await articles.find({
      title: { $regex: '^node', $options: 'i' }
    }).exec();

    expect(res.length).toBe(1);
    expect(res[0].title).toBe('Node.js vs Bun Comparison');
  });

  it('should support $regex with nested dot-notation', async () => {
    const articles = await db.collection<Article>({ name: 'articles' });

    await articles.insert({
      title: 'DevOps 101',
      category: 'devops',
      tags: ['ci/cd'],
      author: { username: 'dev_ops_guru' }
    });

    await articles.insert({
      title: 'Kubernetes Guide',
      category: 'cloud',
      tags: ['k8s'],
      author: { username: 'cloud_architect' }
    });

    const devAuthors = await articles.find({
      'author.username': { $regex: '^dev_' }
    }).exec();

    expect(devAuthors.length).toBe(1);
    expect(devAuthors[0].author.username).toBe('dev_ops_guru');
  });

  it('should combine $regex with $not and logical operators', async () => {
    const articles = await db.collection<Article>({ name: 'articles' });

    await articles.insert({
      title: 'Alpha Release Notes',
      category: 'news',
      tags: ['release'],
      author: { username: 'admin' }
    });

    await articles.insert({
      title: 'Beta Testing Guide',
      category: 'testing',
      tags: ['beta'],
      author: { username: 'qa_lead' }
    });

    await articles.insert({
      title: 'Final Product Launch',
      category: 'news',
      tags: ['launch'],
      author: { username: 'marketing' }
    });

    // Using $regex with $not
    const nonBeta = await articles.find({
      title: { $not: { $regex: /beta/i } }
    }).exec();

    expect(nonBeta.length).toBe(2);

    // Combining with $or
    const releaseOrLaunch = await articles.find({
      $or: [
        { title: { $regex: 'Alpha' } },
        { title: { $regex: 'Launch' } }
      ]
    }).exec();

    expect(releaseOrLaunch.length).toBe(2);
  });
});
