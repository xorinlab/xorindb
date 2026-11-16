import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, Database } from '../src';

interface DocumentPost {
  title: string;
  slug: string;
  category: string;
  content: string;
  author: {
    username: string;
    domain: string;
  };
}

describe('Chained String and Pattern Matching Methods (.regex)', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ name: `test-pattern-db-${Date.now()}` });
  });

  it('should match patterns using .regex() with string and options flag', async () => {
    const posts = await db.collection<DocumentPost>({ name: 'posts' });

    await posts.insert({
      title: 'Building Modern React Apps with XorinDB',
      slug: 'building-modern-react-apps',
      category: 'javascript',
      content: 'A comprehensive guide on local-first architecture.',
      author: { username: 'alex99', domain: 'xorin.org' }
    });

    await posts.insert({
      title: 'Guide to Vue 3 Composition API',
      slug: 'guide-to-vue3-composition',
      category: 'frontend',
      content: 'State management and reactivity patterns.',
      author: { username: 'john_dev', domain: 'vue.org' }
    });

    // Case-insensitive substring match
    const reactPosts = await posts.find()
      .where('title').regex('react', 'i')
      .exec();

    expect(reactPosts.length).toBe(1);
    expect(reactPosts[0].slug).toBe('building-modern-react-apps');

    // Prefix match
    const guidePosts = await posts.find()
      .where('title').regex('^Guide')
      .exec();

    expect(guidePosts.length).toBe(1);
    expect(guidePosts[0].slug).toBe('guide-to-vue3-composition');
  });

  it('should match patterns using native JavaScript RegExp in .regex()', async () => {
    const posts = await db.collection<DocumentPost>({ name: 'posts' });

    await posts.insert({
      title: 'TypeScript 5.x Deep Dive',
      slug: 'typescript-deep-dive',
      category: 'typescript',
      content: 'Type level programming.',
      author: { username: 'ts_guru', domain: 'ts.net' }
    });

    await posts.insert({
      title: 'Node.js Performance Tuning',
      slug: 'nodejs-perf',
      category: 'backend',
      content: 'Optimizing V8 garbage collection.',
      author: { username: 'node_master', domain: 'node.org' }
    });

    const tsPosts = await posts.find()
      .where('title').regex(/typescript/i)
      .exec();

    expect(tsPosts.length).toBe(1);
    expect(tsPosts[0].slug).toBe('typescript-deep-dive');
  });

  it('should match nested dot-notation fields using .regex()', async () => {
    const posts = await db.collection<DocumentPost>({ name: 'posts' });

    await posts.insert({
      title: 'Cloud Native Microservices',
      slug: 'cloud-native',
      category: 'devops',
      content: 'Kubernetes and Istio service mesh.',
      author: { username: 'dev_cloud_eng', domain: 'cloud.io' }
    });

    await posts.insert({
      title: 'Mobile UI Patterns',
      slug: 'mobile-ui',
      category: 'mobile',
      content: 'Touch ergonomics.',
      author: { username: 'designer_pro', domain: 'design.io' }
    });

    const devAuthors = await posts.find()
      .where('author.username').regex('^dev_')
      .exec();

    expect(devAuthors.length).toBe(1);
    expect(devAuthors[0].slug).toBe('cloud-native');

    const ioDomains = await posts.find()
      .where('author.domain').regex(/\.io$/)
      .exec();

    expect(ioDomains.length).toBe(2);
  });

  it('should combine .regex() with other fluent operators and sorting', async () => {
    const posts = await db.collection<DocumentPost>({ name: 'posts' });

    await posts.insert({
      title: 'Post Alpha 1',
      slug: 'alpha-1',
      category: 'updates',
      content: 'Notes.',
      author: { username: 'u1', domain: 'a.com' }
    });

    await posts.insert({
      title: 'Post Alpha 2',
      slug: 'alpha-2',
      category: 'updates',
      content: 'Notes.',
      author: { username: 'u2', domain: 'b.com' }
    });

    await posts.insert({
      title: 'Post Beta',
      slug: 'beta-1',
      category: 'updates',
      content: 'Notes.',
      author: { username: 'u3', domain: 'c.com' }
    });

    const alphas = await posts.find()
      .where('category').eq('updates')
      .where('title').regex('Alpha')
      .sort({ slug: 'desc' })
      .exec();

    expect(alphas.length).toBe(2);
    expect(alphas[0].slug).toBe('alpha-2');
    expect(alphas[1].slug).toBe('alpha-1');
  });
});
